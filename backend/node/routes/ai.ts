/**
 * @file ai.ts
 * @description AI related router for handling chat conversations, messages, daily briefings, and AI datasets.
 * Part of the Node.js backend.
 */

import { Router, Response } from 'express';
import { getRow, getAllRows, runQuery } from '../config/db';
import { RoleAwareRequest, attachUserRole, requireAdmin } from '../middleware/role';
import { generateConversationPdf } from '../services/pdf';
import crypto from 'crypto';

export const aiRouter = Router();

// Helper to get the Python backend URL dynamically (uses Vercel rewrites in production)
const getPythonUrl = (endpoint: string): string => {
  if (process.env.PYTHON_BACKEND_URL) {
    return process.env.PYTHON_BACKEND_URL.replace(/\/$/, '') + endpoint;
  }
  if (process.env.VERCEL_URL) {
    return `https://${process.env.VERCEL_URL}/api/internal-python${endpoint}`;
  }
  return `http://127.0.0.1:8000${endpoint}`;
};

// Attach user role to all AI routes
aiRouter.use(attachUserRole);

// ============================================================================
// CHAT ENDPOINTS
// ============================================================================

/**
 * POST /api/ai/chat
 * Send a message to the AI assistant and get a response.
 * Currently returns a placeholder — will be wired to the LLM later.
 */
aiRouter.post('/chat', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { message, conversation_id } = req.body;

    if (!message || typeof message !== 'string' || message.trim().length === 0) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const now = new Date().toISOString();
    let activeConversationId = conversation_id;

    // Create a new conversation if none provided
    if (!activeConversationId) {
      activeConversationId = crypto.randomUUID();
      const title = message.substring(0, 80) + (message.length > 80 ? '...' : '');
      await runQuery(
        `INSERT INTO chat_conversations (id, user_id, title, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?)`,
        [activeConversationId, user.id, title, now, now]
      );
    } else {
      // Verify conversation belongs to this user
      const conv = await getRow<{ user_id: string }>(
        'SELECT user_id FROM chat_conversations WHERE id = ?',
        [activeConversationId]
      );
      if (!conv || conv.user_id !== user.id) {
        return res.status(404).json({ error: 'Conversation not found' });
      }
      // Update the conversation timestamp
      await runQuery(
        'UPDATE chat_conversations SET updated_at = ? WHERE id = ?',
        [now, activeConversationId]
      );
    }

    // Get previous messages (excluding the one we are about to add)
    const previousMessages = await getAllRows<{ role: string; content: string }>(
      'SELECT role, content FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [activeConversationId]
    );

    // Save the user's message
    const userMessageId = crypto.randomUUID();
    await runQuery(
      `INSERT INTO chat_messages (id, conversation_id, role, content, created_at)
       VALUES (?, ?, 'user', ?, ?)`,
      [userMessageId, activeConversationId, message.trim(), now]
    );

    // Set up HTTP response headers for chunked streaming
    res.setHeader('Content-Type', 'application/x-ndjson');
    res.setHeader('Transfer-Encoding', 'chunked');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    // AI RESPONSE INTEGRATION (FastAPI Streaming Proxy)
    let finalResponse = 'AI Assistant is currently unavailable.';
    let sqlQueries: string[] = [];
    let reasoningSteps: string[] = [];
    let timeTakenMs = 0;
    
    try {
      const pythonChatUrl = getPythonUrl('/chat');
      const response = await fetch(pythonChatUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
          message: message.trim(),
          history: previousMessages
        }),
      });

      if (response.ok && response.body) {
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop() || ''; // Hold onto incomplete lines

          for (const line of lines) {
            if (!line.trim()) continue;
            
            // Forward chunk to client
            res.write(line + '\n');

            try {
              const data = JSON.parse(line);
              if (data.type === 'final_result') {
                finalResponse = data.response;
                sqlQueries = data.sql_queries || [];
                reasoningSteps = data.reasoning_steps || [];
                timeTakenMs = data.time_taken_ms || 0;
              } else if (data.type === 'error') {
                finalResponse = `⚠️ **Error**: ${data.error}`;
                reasoningSteps = ['Error generating response.'];
              }
            } catch (jsonErr) {
              // Ignore partial JSON parse errors
            }
          }
        }
      } else {
        const errText = await response.text();
        finalResponse = `⚠️ **Error**: Failed to generate response from intelligence backend: ${errText}`;
        reasoningSteps = ['Failed to retrieve operational response.'];
        res.write(JSON.stringify({ type: 'error', error: finalResponse }) + '\n');
      }
    } catch (err: any) {
      console.error('Error fetching from AI backend:', err);
      finalResponse = `⚠️ **Error**: Intelligence service is offline. Please verify the FastAPI server is running.`;
      reasoningSteps = ['Backend service offline.'];
      res.write(JSON.stringify({ type: 'error', error: finalResponse }) + '\n');
    }

    const aiMessageId = crypto.randomUUID();
    const aiTimestamp = new Date().toISOString();

    // Store queries and reasoning in message metadata
    const metadata = JSON.stringify({
      placeholder: false,
      sql_queries: sqlQueries,
      reasoning_steps: reasoningSteps
    });

    try {
      await runQuery(
        `INSERT INTO chat_messages (id, conversation_id, role, content, metadata, created_at)
         VALUES (?, ?, 'assistant', ?, ?, ?)`,
        [aiMessageId, activeConversationId, finalResponse, metadata, aiTimestamp]
      );
    } catch (dbErr) {
      console.error('Failed to store AI response in database:', dbErr);
    }

    // Save logs to PostgreSQL/Supabase for law enforcement accountability
    try {
      const hmacSecret = process.env.HMAC_SECRET || 'ksp-secure-ai-token-secret-key-1029';
      const hmac = crypto.createHmac('sha256', hmacSecret);
      const messageToSign = `${user.id}:${message.trim()}:${aiTimestamp}`;
      const signature = hmac.update(messageToSign).digest('hex');
      const auditLogId = crypto.randomUUID();

      await runQuery(
        `INSERT INTO ai_audit_logs (id, user_id, user_query, ai_response, sql_queries_run, time_taken_ms, created_at, cryptographic_signature)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          auditLogId,
          user.id,
          message.trim(),
          finalResponse,
          JSON.stringify(sqlQueries),
          timeTakenMs,
          aiTimestamp,
          signature
        ]
      );
    } catch (auditErr) {
      console.error('Failed to log AI transaction in audit trail:', auditErr);
    }

    // Send closing event with metadata
    res.write(JSON.stringify({
      type: 'complete',
      conversation_id: activeConversationId,
      message: {
        id: aiMessageId,
        role: 'assistant',
        content: finalResponse,
        metadata: {
          sql_queries: sqlQueries,
          reasoning_steps: reasoningSteps
        },
        created_at: aiTimestamp,
      }
    }) + '\n');
    
    res.end();
  } catch (error) {
    console.error('AI chat error:', error);
    if (!res.headersSent) {
      return res.status(500).json({ error: 'Internal server error during AI chat' });
    } else {
      res.end();
    }
  }
});

/**
 * GET /api/ai/conversations
 * List all chat conversations for the authenticated user.
 */
aiRouter.get('/conversations', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const conversations = await getAllRows<{
      id: string;
      title: string;
      created_at: string;
      updated_at: string;
    }>(
      'SELECT id, title, created_at, updated_at FROM chat_conversations WHERE user_id = ? ORDER BY updated_at DESC',
      [user.id]
    );

    return res.status(200).json({ success: true, conversations });
  } catch (error) {
    console.error('Error fetching conversations:', error);
    return res.status(500).json({ error: 'Internal server error fetching conversations' });
  }
});

/**
 * GET /api/ai/conversations/:id
 * Get all messages in a specific conversation.
 */
aiRouter.get('/conversations/:id', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    // Verify ownership
    const conv = await getRow<{ user_id: string; title: string }>(
      'SELECT user_id, title FROM chat_conversations WHERE id = ?',
      [id]
    );
    if (!conv || conv.user_id !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    const messages = await getAllRows<{
      id: string;
      role: string;
      content: string;
      metadata: string | null;
      created_at: string;
    }>(
      'SELECT id, role, content, metadata, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    const formattedMessages = messages.map(msg => {
      let parsedMetadata: any = {};
      try {
        parsedMetadata = msg.metadata ? JSON.parse(msg.metadata) : {};
      } catch (err) {
        parsedMetadata = {};
      }
      return {
        id: msg.id,
        role: msg.role,
        content: msg.content,
        metadata: parsedMetadata,
        created_at: msg.created_at
      };
    });

    return res.status(200).json({
      success: true,
      conversation: { id, title: conv.title },
      messages: formattedMessages,
    });
  } catch (error) {
    console.error('Error fetching conversation messages:', error);
    return res.status(500).json({ error: 'Internal server error fetching messages' });
  }
});

/**
 * GET /api/ai/conversations/:id/pdf
 * Export a conversation history to a PDF file and stream it.
 */
aiRouter.get('/conversations/:id/pdf', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    // Verify ownership
    const conv = await getRow<{ user_id: string; title: string }>(
      'SELECT user_id, title FROM chat_conversations WHERE id = ?',
      [id]
    );
    if (!conv || conv.user_id !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Get all messages
    const messages = await getAllRows<{
      id: string;
      role: string;
      content: string;
      created_at: string;
    }>(
      'SELECT id, role, content, created_at FROM chat_messages WHERE conversation_id = ? ORDER BY created_at ASC',
      [id]
    );

    // Get officer profile
    const profile = await getRow<any>(
      'SELECT * FROM officer_profiles WHERE user_id = ?',
      [user.id]
    );

    // Clean title for filename (replace non-alphanumeric with underscore)
    const safeTitle = (conv.title || 'Untitled')
      .replace(/[^a-zA-Z0-9]/g, '_')
      .substring(0, 50);
    const dateStr = new Date().toISOString().split('T')[0];
    const filename = `KSP_AI_Briefing_${safeTitle}_${dateStr}.pdf`;

    // Generate PDF
    const filePath = await generateConversationPdf(id, conv.title || 'Briefing', messages, profile, user.email);

    // Send file (supporting inline preview)
    if (req.query.preview === 'true') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${filename}"`);
      return res.sendFile(filePath);
    } else {
      return res.download(filePath, filename);
    }
  } catch (error) {
    console.error('Error exporting conversation to PDF:', error);
    return res.status(500).json({ error: 'Internal server error exporting PDF' });
  }
});


/**
 * DELETE /api/ai/conversations/:id
 * Delete a conversation and all its messages.
 */
aiRouter.delete('/conversations/:id', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { id } = req.params;

    // Verify ownership
    const conv = await getRow<{ user_id: string }>(
      'SELECT user_id FROM chat_conversations WHERE id = ?',
      [id]
    );
    if (!conv || conv.user_id !== user.id) {
      return res.status(404).json({ error: 'Conversation not found' });
    }

    // Delete messages first (cascade should handle this, but being explicit)
    await runQuery('DELETE FROM chat_messages WHERE conversation_id = ?', [id]);
    await runQuery('DELETE FROM chat_conversations WHERE id = ?', [id]);

    return res.status(200).json({ success: true, message: 'Conversation deleted' });
  } catch (error) {
    console.error('Error deleting conversation:', error);
    return res.status(500).json({ error: 'Internal server error deleting conversation' });
  }
});

// ============================================================================
// BRIEFING ENDPOINTS
// ============================================================================

/**
 * GET /api/ai/briefing
 * Get today's personalized briefing for the logged-in user.
 * Fetches briefings targeted at the user directly, by their role, or by their station.
 */
aiRouter.get('/briefing', async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    // Get user's profile for station-based targeting
    const profile = await getRow<{ station: string; rank: string }>(
      'SELECT station, rank FROM officer_profiles WHERE user_id = ?',
      [user.id]
    );

    // Fetch briefings that target this user:
    // 1. Directly by user_id
    // 2. By their role
    // 3. By their station
    // 4. Briefings with no specific target (broadcast to all)
    const briefings = await getAllRows<{
      id: string;
      title: string;
      content: string;
      priority: string;
      effective_date: string;
      expires_at: string | null;
      created_at: string;
    }>(
      `SELECT id, title, content, priority, effective_date, expires_at, created_at
       FROM daily_briefings
       WHERE effective_date <= ?
         AND (expires_at IS NULL OR expires_at >= ?)
         AND (
           target_user_id = ?
           OR target_role = ?
           OR target_station = ?
           OR (target_user_id IS NULL AND target_role IS NULL AND target_station IS NULL)
         )
       ORDER BY
         CASE priority
           WHEN 'urgent' THEN 1
           WHEN 'high' THEN 2
           WHEN 'normal' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         created_at DESC`,
      [today, today, user.id, req.userRole || 'officer', profile?.station || '']
    );

    return res.status(200).json({
      success: true,
      date: today,
      role: req.userRole,
      briefings,
    });
  } catch (error) {
    console.error('Error fetching briefing:', error);
    return res.status(500).json({ error: 'Internal server error fetching briefing' });
  }
});

/**
 * POST /api/ai/briefings
 * Create a new daily briefing (admin only).
 */
aiRouter.post('/briefings', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { title, content, priority, target_user_id, target_role, target_station, effective_date, expires_at } = req.body;

    if (!title || !content) {
      return res.status(400).json({ error: 'Title and content are required' });
    }

    const validPriorities = ['low', 'normal', 'high', 'urgent'];
    const safePriority = validPriorities.includes(priority) ? priority : 'normal';

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const safeEffectiveDate = effective_date || now.split('T')[0];

    await runQuery(
      `INSERT INTO daily_briefings (id, created_by, target_user_id, target_role, target_station, title, content, priority, effective_date, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, user.id, target_user_id || null, target_role || null, target_station || null, title, content, safePriority, safeEffectiveDate, expires_at || null, now]
    );

    return res.status(201).json({
      success: true,
      briefing: { id, title, content, priority: safePriority, effective_date: safeEffectiveDate, created_at: now },
    });
  } catch (error) {
    console.error('Error creating briefing:', error);
    return res.status(500).json({ error: 'Internal server error creating briefing' });
  }
});

/**
 * GET /api/ai/briefings
 * List all briefings (admin only).
 */
aiRouter.get('/briefings', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const briefings = await getAllRows<{
      id: string;
      title: string;
      content: string;
      priority: string;
      target_user_id: string | null;
      target_role: string | null;
      target_station: string | null;
      effective_date: string;
      expires_at: string | null;
      created_at: string;
    }>(
      'SELECT * FROM daily_briefings ORDER BY created_at DESC'
    );

    return res.status(200).json({ success: true, briefings });
  } catch (error) {
    console.error('Error listing briefings:', error);
    return res.status(500).json({ error: 'Internal server error listing briefings' });
  }
});

/**
 * DELETE /api/ai/briefings/:id
 * Delete a briefing (admin only).
 */
aiRouter.delete('/briefings/:id', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const { id } = req.params;

    const existing = await getRow<{ id: string }>('SELECT id FROM daily_briefings WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'Briefing not found' });
    }

    await runQuery('DELETE FROM daily_briefings WHERE id = ?', [id]);
    return res.status(200).json({ success: true, message: 'Briefing deleted' });
  } catch (error) {
    console.error('Error deleting briefing:', error);
    return res.status(500).json({ error: 'Internal server error deleting briefing' });
  }
});

// ============================================================================
// DATASET REGISTRY ENDPOINTS
// ============================================================================

/**
 * GET /api/ai/datasets
 * List all registered datasets (admin only).
 */
aiRouter.get('/datasets', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const datasets = await getAllRows<{
      id: string;
      table_name: string;
      description: string;
      is_enabled: number;
      added_at: string;
    }>(
      'SELECT id, table_name, description, is_enabled, added_at FROM ai_dataset_registry ORDER BY added_at DESC'
    );

    return res.status(200).json({ success: true, datasets });
  } catch (error) {
    console.error('Error listing datasets:', error);
    return res.status(500).json({ error: 'Internal server error listing datasets' });
  }
});

/**
 * POST /api/ai/datasets
 * Register a new dataset for AI access (admin only).
 */
aiRouter.post('/datasets', requireAdmin, async (req: RoleAwareRequest, res: Response) => {
  try {
    const user = req.user!;
    const { table_name, description } = req.body;

    if (!table_name) {
      return res.status(400).json({ error: 'table_name is required' });
    }

    // Check if already registered
    const existing = await getRow<{ id: string }>(
      'SELECT id FROM ai_dataset_registry WHERE table_name = ?',
      [table_name]
    );
    if (existing) {
      return res.status(409).json({ error: 'Dataset already registered' });
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    await runQuery(
      `INSERT INTO ai_dataset_registry (id, table_name, description, is_enabled, added_by, added_at)
       VALUES (?, ?, ?, 1, ?, ?)`,
      [id, table_name, description || null, user.id, now]
    );

    return res.status(201).json({
      success: true,
      dataset: { id, table_name, description, is_enabled: 1, added_at: now },
    });
  } catch (error) {
    console.error('Error registering dataset:', error);
    return res.status(500).json({ error: 'Internal server error registering dataset' });
  }
});

// ============================================================================
// USER ROLE ENDPOINT (for frontend to check current user's role)
// ============================================================================

/**
 * GET /api/ai/role
 * Get the current user's role.
 */
aiRouter.get('/role', async (req: RoleAwareRequest, res: Response) => {
  return res.status(200).json({
    success: true,
    role: req.userRole || 'officer',
  });
});
