/**
 * @file NetworkAnalysis.tsx
 * @description State-of-the-Art Police Criminal Network Analysis & Visualizer.
 * Searches ALL 13,334 accused and 10,000 cases across the PostgreSQL database.
 * Supports Similar Cases in Same Area (Organized Crime Groups) detection and component isolation.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  NodeProps,
  EdgeProps,
  ReactFlowProvider,
  getSmoothStepPath,
  EdgeLabelRenderer,
  BackgroundVariant
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useLanguage } from '../LanguageContext';

// Entity Color Palette & Configuration
const ENTITY_CONFIG: Record<string, { bg: string; border: string; text: string; icon: string }> = {
  ACCUSED: { bg: 'linear-gradient(135deg, #1f0709 0%, #3f0e12 100%)', border: '#ef4444', text: '#fca5a5', icon: '🔴' },
  VICTIM: { bg: 'linear-gradient(135deg, #071529 0%, #0e2a52 100%)', border: '#3b82f6', text: '#93c5fd', icon: '🔵' },
  LOCATION: { bg: 'linear-gradient(135deg, #062016 0%, #0c3e2b 100%)', border: '#10b981', text: '#6ee7b7', icon: '🟢' },
  FINANCIAL_ACCOUNT: { bg: 'linear-gradient(135deg, #1b0724 0%, #380e4a 100%)', border: '#a855f7', text: '#d8b4fe', icon: '🟣' },
  VEHICLE: { bg: 'linear-gradient(135deg, #091a24 0%, #153245 100%)', border: '#38bdf8', text: '#7dd3fc', icon: '⚪' },
  INCIDENT: { bg: 'linear-gradient(135deg, #241a07 0%, #4a360e 100%)', border: '#f59e0b', text: '#fde047', icon: '🟡' },
};

// Custom ReactFlow Entity Node Card
const CustomEntityNode: React.FC<NodeProps> = ({ data, selected }) => {
  const entityType = (data.type as string) || 'INCIDENT';
  const cfg = ENTITY_CONFIG[entityType] || ENTITY_CONFIG.INCIDENT;
  const riskScore = (data.risk_score as number) || 5;

  const getRiskBadgeColor = (score: number) => {
    if (score >= 8) return { bg: '#450a0a', text: '#f87171', border: '#ef4444' };
    if (score >= 5) return { bg: '#451a03', text: '#fbbf24', border: '#f59e0b' };
    return { bg: '#064e3b', text: '#34d399', border: '#10b981' };
  };

  const riskStyle = getRiskBadgeColor(riskScore);

  return (
    <div
      style={{
        background: cfg.bg,
        border: `2px solid ${selected ? '#c5a059' : cfg.border}`,
        borderRadius: '12px',
        padding: '12px 16px',
        minWidth: '240px',
        boxShadow: selected ? `0 0 24px ${cfg.border}` : '0 4px 16px rgba(0,0,0,0.5)',
        cursor: 'pointer',
        color: '#f8fafc',
        fontFamily: "'Outfit', sans-serif",
        transition: 'all 0.2s ease'
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: cfg.border, width: '10px', height: '10px' }} />

      {/* Header Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span>{cfg.icon}</span>
          <span style={{ fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.8px', color: cfg.text }}>
            {entityType.replace('_', ' ')}
          </span>
        </div>

        <span style={{
          background: riskStyle.bg,
          color: riskStyle.text,
          border: `1px solid ${riskStyle.border}`,
          fontSize: '0.7rem',
          fontWeight: 900,
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          RISK {riskScore}/10
        </span>
      </div>

      {/* Primary Label */}
      <div style={{ fontSize: '0.98rem', fontWeight: 800, color: '#ffffff', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {data.label as string}
      </div>

      {/* ID Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>
        <span>ID: {data.id as string}</span>
        {riskScore >= 8 && (
          <span style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#f87171', padding: '1px 5px', borderRadius: '3px', fontSize: '0.68rem', fontWeight: 800 }}>
            FLAGGED
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: cfg.border, width: '10px', height: '10px' }} />
    </div>
  );
};

// Custom ReactFlow Edge Component
const CustomNetworkEdge: React.FC<EdgeProps> = (props) => {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, label, selected } = props;
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
  });

  const isSimilarArea = label === 'SIMILAR_AREA_CRIME' || label === 'SIMILAR_AREA_OFFENDER' || label === 'SAME_AREA_SUSPECT';
  const isGangCoAccused = label === 'CO_ACCUSED_GANG' || label === 'CO_ACCUSED';

  const strokeColor = selected
    ? '#c5a059'
    : isGangCoAccused
    ? '#ef4444'
    : isSimilarArea
    ? '#a855f7'
    : '#475569';

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 3 : isGangCoAccused || isSimilarArea ? 2.5 : 2}
        strokeDasharray={isSimilarArea ? '6 4' : 'none'}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#070f19',
              color: selected ? '#ffe082' : isGangCoAccused ? '#fca5a5' : isSimilarArea ? '#d8b4fe' : '#cbd5e1',
              border: `1px solid ${selected ? '#c5a059' : isGangCoAccused ? '#ef4444' : isSimilarArea ? '#a855f7' : '#334155'}`,
              padding: '2px 8px',
              borderRadius: '4px',
              fontSize: '0.72rem',
              fontWeight: 800,
              pointerEvents: 'all',
              boxShadow: '0 2px 8px rgba(0,0,0,0.5)'
            }}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const nodeTypes = { customEntity: CustomEntityNode };
const edgeTypes = { customEdge: CustomNetworkEdge };

const NetworkGraphContent: React.FC = () => {
  const { t } = useLanguage();

  const [nodes, setNodes, onNodesChange] = useNodesState<any>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<any>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [selectedEntity, setSelectedEntity] = useState<any | null>(null);
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [networkMode, setNetworkMode] = useState<'case' | 'gang'>('case');
  const [filterType, setFilterType] = useState<string>('ALL');
  const [similarCasesCount, setSimilarCasesCount] = useState<number>(0);

  // Form state for adding entity
  const [newType, setNewType] = useState<string>('ACCUSED');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newRisk, setNewRisk] = useState<number>(7);
  const [newTargetId, setNewTargetId] = useState<string>('');
  const [newRelType, setNewRelType] = useState<string>('CO_ACCUSED');
  const [newNotes, setNewNotes] = useState<string>('');

  const fetchGraphData = async (queryText: string = '', mode: 'case' | 'gang' = networkMode) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('mode', mode);
      if (queryText) params.append('query', queryText);

      const url = `/api/network-graph?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.nodes && data.edges) {
          const areaCount = data.edges.filter((e: any) => 
            e.label === 'SIMILAR_AREA_OFFENDER' || e.label === 'SIMILAR_AREA_CRIME' || e.label === 'SAME_AREA_SUSPECT'
          ).length;
          setSimilarCasesCount(data.telemetry?.similar_cases_count || areaCount);

          // Format nodes for ReactFlow with grid layout
          const formattedNodes = data.nodes.map((n: any, idx: number) => ({
            id: n.id,
            type: 'customEntity',
            position: { x: (idx % 4) * 310 + 60, y: Math.floor(idx / 4) * 190 + 60 },
            data: {
              id: n.id,
              type: n.type,
              label: n.label,
              risk_score: n.risk_score,
              secondary_info: n.secondary_info
            }
          }));

          const formattedEdges = data.edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'customEdge',
            label: e.label,
            data: { evidence: e.evidence }
          }));

          setNodes(formattedNodes);
          setEdges(formattedEdges);
        }
      }
    } catch (err) {
      console.error('Failed to fetch network graph:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGraphData(searchQuery, networkMode);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, networkMode]);

  const handleNodeClick = (_: any, node: any) => {
    setSelectedEntity(node.data);
  };

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLabel) return;

    try {
      const res = await fetch('/api/network-graph/entity', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_type: newType,
          primary_label: newLabel,
          risk_score: newRisk,
          target_entity_id: newTargetId || null,
          relationship_type: newRelType,
          secondary_notes: newNotes
        })
      });

      if (res.ok) {
        setShowAddDrawer(false);
        setNewLabel('');
        setNewNotes('');
        fetchGraphData(searchQuery, networkMode);
      }
    } catch (err) {
      console.error('Failed to create entity:', err);
    }
  };

  // Category Filtered Nodes
  const displayedNodes = useMemo(() => {
    return nodes.filter(n => filterType === 'ALL' || n.data.type === filterType);
  }, [nodes, filterType]);

  const totalHighRisk = useMemo(() => nodes.filter(n => (n.data.risk_score || 0) >= 8).length, [nodes]);

  return (
    <div style={{ padding: '1.25rem', maxWidth: '1600px', margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>

      {/* TOP HERO HEADER */}
      <div style={{
        background: 'linear-gradient(135deg, #070f19 0%, #0b1e36 60%, #173259 100%)',
        border: '1px solid rgba(197, 160, 89, 0.45)',
        borderRadius: '14px',
        padding: '1.5rem 1.75rem',
        marginBottom: '1.25rem',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ background: 'rgba(197, 160, 89, 0.18)', color: '#c5a059', border: '1px solid rgba(197, 160, 89, 0.4)', padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800 }}>
                KSP INTELLIGENCE COMMAND
              </span>
              <span style={{
                background: networkMode === 'case' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(168, 85, 247, 0.15)',
                color: networkMode === 'case' ? '#34d399' : '#d8b4fe',
                border: `1px solid ${networkMode === 'case' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(168, 85, 247, 0.3)'}`,
                padding: '0.2rem 0.6rem',
                borderRadius: '20px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {networkMode === 'case' ? 'MODE: CASE TOPOLOGY (FIRs, ACCUSED & VICTIMS)' : 'MODE: GANG NETWORK (SIMILAR CRIMES IN SAME AREA)'}
              </span>
            </div>
            <h2 style={{ margin: 0, color: '#f8fafc', fontSize: '1.6rem', fontWeight: 900, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>{networkMode === 'case' ? '📂' : '👥'}</span>
              {t("Tactical Criminal Network & Relationship Analysis")}
            </h2>
          </div>

          <button
            onClick={() => setShowAddDrawer(true)}
            style={{
              background: 'linear-gradient(135deg, #c5a059 0%, #9a7b3c 100%)',
              color: '#070f19',
              border: 'none',
              padding: '0.7rem 1.3rem',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '0.9rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(197, 160, 89, 0.3)'
            }}
          >
            <span>➕</span> {t("Add New Entity to Graph")}
          </button>
        </div>

        {/* OPTION SELECTOR: SHOW CASE NETWORK & SHOW GANG NETWORK */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setNetworkMode('case')}
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.9rem 1.25rem',
              borderRadius: '12px',
              border: networkMode === 'case' ? '2px solid #c5a059' : '1px solid rgba(197, 160, 89, 0.3)',
              background: networkMode === 'case'
                ? 'linear-gradient(135deg, rgba(197, 160, 89, 0.3) 0%, rgba(7, 15, 25, 0.95) 100%)'
                : 'rgba(7, 15, 25, 0.6)',
              color: networkMode === 'case' ? '#ffe082' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: networkMode === 'case' ? '0 0 24px rgba(197, 160, 89, 0.35)' : 'none',
              transition: 'all 0.25s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: networkMode === 'case' ? '#c5a059' : '#1e293b',
              color: networkMode === 'case' ? '#070f19' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 900
            }}>
              📂
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t("Show Case Network")}
              </div>
              <div style={{ fontSize: '0.78rem', color: networkMode === 'case' ? '#cbd5e1' : '#64748b', fontWeight: 600, marginTop: '2px' }}>
                Diagrammatic FIR Case → Accused → Victim topology
              </div>
            </div>
          </button>

          <button
            onClick={() => setNetworkMode('gang')}
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.9rem 1.25rem',
              borderRadius: '12px',
              border: networkMode === 'gang' ? '2px solid #a855f7' : '1px solid rgba(168, 85, 247, 0.3)',
              background: networkMode === 'gang'
                ? 'linear-gradient(135deg, rgba(168, 85, 247, 0.3) 0%, rgba(7, 15, 25, 0.95) 100%)'
                : 'rgba(7, 15, 25, 0.6)',
              color: networkMode === 'gang' ? '#d8b4fe' : '#94a3b8',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '1rem',
              boxShadow: networkMode === 'gang' ? '0 0 24px rgba(168, 85, 247, 0.35)' : 'none',
              transition: 'all 0.25s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '10px',
              background: networkMode === 'gang' ? '#a855f7' : '#1e293b',
              color: networkMode === 'gang' ? '#ffffff' : '#94a3b8',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.4rem',
              fontWeight: 900
            }}>
              👥
            </div>
            <div>
              <div style={{ fontSize: '1rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                {t("Show Gang Network")}
              </div>
              <div style={{ fontSize: '0.78rem', color: networkMode === 'gang' ? '#cbd5e1' : '#64748b', fontWeight: 600, marginTop: '2px' }}>
                Accused of similar crimes in same area &amp; syndicates
              </div>
            </div>
          </button>
        </div>

        {/* 5 STAT METRIC PILLS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginTop: '1.25rem' }}>
          <div style={{ background: 'rgba(7, 15, 25, 0.7)', border: '1px solid rgba(197, 160, 89, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase' }}>Network Nodes</div>
            <div style={{ fontSize: '1.4rem', color: '#f8fafc', fontWeight: 900 }}>{nodes.length}</div>
          </div>
          <div style={{ background: 'rgba(7, 15, 25, 0.7)', border: '1px solid rgba(56, 189, 248, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 800, textTransform: 'uppercase' }}>Active Links</div>
            <div style={{ fontSize: '1.4rem', color: '#f8fafc', fontWeight: 900 }}>{edges.length}</div>
          </div>
          <div style={{ background: 'rgba(7, 15, 25, 0.7)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#f87171', fontWeight: 800, textTransform: 'uppercase' }}>High Risk Threats</div>
            <div style={{ fontSize: '1.4rem', color: '#f87171', fontWeight: 900 }}>{totalHighRisk}</div>
          </div>
          <div style={{ background: 'rgba(7, 15, 25, 0.7)', border: '1px solid rgba(168, 85, 247, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#c084fc', fontWeight: 800, textTransform: 'uppercase' }}>
              {networkMode === 'gang' ? 'Gang Area Links' : 'Similar Area Crimes'}
            </div>
            <div style={{ fontSize: '1.4rem', color: '#d8b4fe', fontWeight: 900 }}>{similarCasesCount} Found</div>
          </div>
          <div style={{ background: 'rgba(7, 15, 25, 0.7)', border: '1px solid rgba(52, 211, 153, 0.3)', borderRadius: '8px', padding: '0.75rem 1rem' }}>
            <div style={{ fontSize: '0.72rem', color: '#34d399', fontWeight: 800, textTransform: 'uppercase' }}>Active Mode</div>
            <div style={{ fontSize: '1.1rem', color: '#f8fafc', fontWeight: 900 }}>
              {networkMode === 'case' ? 'Case Diagrammatic' : 'Gang Network Analysis'}
            </div>
          </div>
        </div>

        {/* TARGETED SEARCH BAR ACROSS ENTIRE DATABASE */}
        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.25rem', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: '280px', position: 'relative' }}>
            <input
              type="text"
              placeholder={networkMode === 'case'
                ? t("Search cases, FIRs, accused, or locations (e.g. Bhavsar, Shetty, Indiranagar)...")
                : t("Search accused gang suspects, crime types, or station areas...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                background: '#040a14',
                border: '2px solid #c5a059',
                color: '#f8fafc',
                padding: '0.7rem 2.5rem 0.7rem 1rem',
                borderRadius: '8px',
                outline: 'none',
                fontSize: '0.92rem',
                fontWeight: 700
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{
                  position: 'absolute',
                  right: '10px',
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  fontSize: '1.1rem',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            )}
          </div>

          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            style={{
              background: '#040a14',
              border: '1px solid #c5a059',
              color: '#f8fafc',
              padding: '0.65rem 1rem',
              borderRadius: '8px',
              outline: 'none',
              fontWeight: 700,
              fontSize: '0.88rem'
            }}
          >
            <option value="ALL">Show All Categories</option>
            <option value="ACCUSED">🔴 Accused / Suspects</option>
            <option value="VICTIM">🔵 Victims</option>
            <option value="LOCATION">🟢 Locations</option>
            <option value="FINANCIAL_ACCOUNT">🟣 Financial &amp; Phones</option>
            <option value="VEHICLE">⚪ Vehicles</option>
            <option value="INCIDENT">🟡 FIR Incidents</option>
          </select>
        </div>
      </div>

      {/* GRAPH CANVAS & INSPECTOR SPLIT VIEW */}
      <div style={{ display: 'flex', gap: '1.25rem', height: '640px', position: 'relative' }}>

        {/* MAIN REACTFLOW GRAPH CANVAS */}
        <div style={{
          flex: 1,
          background: '#040a14',
          border: '1px solid rgba(197, 160, 89, 0.4)',
          borderRadius: '14px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#c5a059', flexDirection: 'column', gap: '1rem' }}>
              <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid #c5a059', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <strong style={{ fontSize: '1.05rem' }}>
                {searchQuery ? `Searching 13,334 Criminals & 10,000 Cases for '${searchQuery}'...` : 'Building Full Database Criminal Network Topology...'}
              </strong>
            </div>
          ) : displayedNodes.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#94a3b8', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>🔍</span>
              <strong style={{ fontSize: '1.1rem', color: '#f8fafc' }}>No Criminal Network Matched "{searchQuery}"</strong>
              <span style={{ fontSize: '0.85rem' }}>Try searching another criminal name, FIR number, or clearing the search bar.</span>
            </div>
          ) : (
            <ReactFlow
              nodes={displayedNodes}
              edges={edges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={handleNodeClick}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#1e293b" />
              <Controls style={{ background: '#070f19', border: '1px solid #c5a059', borderRadius: '8px', fill: '#c5a059' }} />
              <MiniMap style={{ background: '#070f19', border: '1px solid #c5a059', borderRadius: '8px' }} nodeColor="#c5a059" maskColor="rgba(4, 10, 20, 0.8)" />
            </ReactFlow>
          )}
        </div>

        {/* RIGHT SIDE ENTITY INSPECTOR PANEL */}
        {selectedEntity && (
          <div style={{
            width: '360px',
            background: '#070f19',
            border: '1px solid #c5a059',
            borderRadius: '14px',
            padding: '1.25rem',
            overflowY: 'auto',
            boxShadow: '0 8px 24px rgba(0, 0, 0, 0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid rgba(197, 160, 89, 0.3)', pb: '0.75rem', marginBottom: '1rem' }}>
              <strong style={{ color: '#c5a059', fontSize: '1.1rem' }}>Entity Inspector</strong>
              <button
                onClick={() => setSelectedEntity(null)}
                style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase' }}>
                {selectedEntity.type}
              </span>
              <h3 style={{ margin: '0.2rem 0', color: '#f8fafc', fontSize: '1.3rem', fontWeight: 900 }}>
                {selectedEntity.label}
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8', fontFamily: 'monospace' }}>ID: {selectedEntity.id}</span>
            </div>

            <div style={{ background: '#040a14', border: '1px solid rgba(255,255,255,0.1)', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Threat Risk Rating</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '8px', background: '#1e293b', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(selectedEntity.risk_score || 5) * 10}%`, height: '100%', background: (selectedEntity.risk_score || 5) >= 8 ? '#ef4444' : '#f59e0b' }}></div>
                </div>
                <strong style={{ color: (selectedEntity.risk_score || 5) >= 8 ? '#f87171' : '#fbbf24', fontSize: '1.1rem' }}>
                  {selectedEntity.risk_score}/10
                </strong>
              </div>
            </div>

            {selectedEntity.secondary_info && (
              <div style={{ background: '#040a14', border: '1px solid rgba(255,255,255,0.1)', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#c5a059', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Metadata &amp; Intelligence Notes</div>
                <pre style={{ margin: 0, color: '#cbd5e1', fontSize: '0.82rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
                  {JSON.stringify(selectedEntity.secondary_info, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* SLIDE-OVER ADD ENTITY DRAWER */}
      {showAddDrawer && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.7)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <div style={{
            width: '420px',
            height: '100%',
            background: '#070f19',
            borderLeft: '2px solid #c5a059',
            padding: '1.75rem',
            overflowY: 'auto',
            boxShadow: '-10px 0 30px rgba(0,0,0,0.8)',
            color: '#f8fafc'
          }}>
            <div style={{ display: 'flex', justify: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid rgba(197, 160, 89, 0.3)', pb: '1rem' }}>
              <h3 style={{ margin: 0, color: '#c5a059', fontSize: '1.2rem', fontWeight: 800 }}>➕ Add New Entity to Investigation</h3>
              <button onClick={() => setShowAddDrawer(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleCreateEntity} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Entity Category:</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  style={{ width: '100%', background: '#040a14', border: '1px solid #c5a059', color: '#f8fafc', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                >
                  <option value="ACCUSED">🔴 ACCUSED / SUSPECT</option>
                  <option value="VICTIM">🔵 VICTIM</option>
                  <option value="LOCATION">🟢 LOCATION / HOTSPOT</option>
                  <option value="FINANCIAL_ACCOUNT">🟣 FINANCIAL ACCOUNT / PHONE</option>
                  <option value="VEHICLE">⚪ VEHICLE</option>
                  <option value="INCIDENT">🟡 CASE INCIDENT (FIR)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Primary Label / Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kiran Kumar / KA-04-AB-1234 / SBI A/C 9876"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={{ width: '100%', background: '#040a14', border: '1px solid #cbd5e1', color: '#f8fafc', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, marginBottom: '0.4rem' }}>
                  <span>Threat Risk Rating:</span>
                  <span style={{ color: '#fbbf24' }}>{newRisk}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={newRisk}
                  onChange={(e) => setNewRisk(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#c5a059' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Link to Existing Entity (Optional):</label>
                <select
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  style={{ width: '100%', background: '#040a14', border: '1px solid #cbd5e1', color: '#f8fafc', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                >
                  <option value="">-- Standalone Entity --</option>
                  {nodes.map((n) => (
                    <option key={n.id} value={n.id}>
                      {n.data.label} ({n.data.type}) - ID: {n.id}
                    </option>
                  ))}
                </select>
              </div>

              {newTargetId && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Relationship Type:</label>
                  <select
                    value={newRelType}
                    onChange={(e) => setNewRelType(e.target.value)}
                    style={{ width: '100%', background: '#040a14', border: '1px solid #cbd5e1', color: '#f8fafc', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                  >
                    <option value="CO_ACCUSED">CO_ACCUSED</option>
                    <option value="TRANSFERRED_FUNDS">TRANSFERRED_FUNDS</option>
                    <option value="SPOTTED_AT">SPOTTED_AT</option>
                    <option value="VICTIM_OF">VICTIM_OF</option>
                    <option value="ASSOCIATED_VEHICLE">ASSOCIATED_VEHICLE</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#c5a059', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Verbatim Evidence Notes:</label>
                <textarea
                  rows={3}
                  placeholder="Official police notes or case file reference..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{ width: '100%', background: '#040a14', border: '1px solid #cbd5e1', color: '#f8fafc', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(false)}
                  style={{ flex: 1, background: '#1e293b', color: '#cbd5e1', border: 'none', padding: '0.85rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #c5a059 0%, #9a7b3c 100%)', color: '#070f19', border: 'none', padding: '0.85rem', borderRadius: '8px', fontWeight: 900, cursor: 'pointer' }}
                >
                  Save &amp; Insert
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
};

export const NetworkAnalysis: React.FC = () => {
  return (
    <ReactFlowProvider>
      <NetworkGraphContent />
    </ReactFlowProvider>
  );
};

export default NetworkAnalysis;
