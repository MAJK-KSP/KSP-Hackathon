import json
import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from pydantic_ai import Agent

from agents.db_agent import model, execute_select_query

logger = logging.getLogger("uvicorn.error")

router = APIRouter(prefix="/api/network", tags=["Network Analysis"])

class NetworkResponse(BaseModel):
    nodes: list[dict] = Field(description="List of nodes. Each node must have 'id', 'label', 'group' (e.g., 'Criminal', 'Victim', 'Location', 'Case'), and optional 'details'.")
    links: list[dict] = Field(description="List of links between nodes. Each link must have 'source' (node id), 'target' (node id), and 'label' (e.g., 'Co-accused', 'Spotted at').")
    explanation: str = Field(description="A markdown-formatted detailed explanation of the detected networks, organized crime groups, and any hidden connections inferred by the LLM from the data.")

# Create a specialized agent for Network Analysis that has the DB query tool
network_agent = Agent(
    model=model,
    system_prompt='''You are an elite Intelligence Analyst AI for the Karnataka State Police.
Your task is to analyze the criminal database and extract structured network relationships.

1. You MUST use the `execute_select_query` tool to query the database tables.
2. Identify all criminals, victims, locations, and cases.
3. Determine connections between them.
4. Extract `nodes` and `links` to build a comprehensive criminal network graph.
5. Provide a detailed markdown `explanation` of the networks you found.
6. Return the data ONLY as a valid JSON string object.
CRITICAL: The JSON MUST exactly match this schema:
{
  "nodes": [ {"id": "unique_string", "label": "Display Name", "group": "Accused/Victim/Location/Case", "details": "Extra info"} ],
  "links": [ {"source": "node_id_1", "target": "node_id_2", "value": 1} ],
  "explanation": "Markdown text"
}
Do not wrap it in markdown block quotes. Output raw JSON only.
''',
    retries=3,
)

# Attach the DB query tool from db_agent
network_agent.tool_plain(execute_select_query)

@router.get("/analyze", response_model=NetworkResponse)
async def analyze_criminal_network():
    try:
        prompt = "Fetch all criminals and their connections from the database, build a relationship graph, and explain how they are connected. Output valid JSON only."
        # Run the agent
        result = await network_agent.run(prompt)
        
        # Parse the JSON string
        try:
            import re
            raw_output = getattr(result, 'data', getattr(result, 'output', ''))
            
            # Find the first '{' and last '}'
            start_idx = raw_output.find('{')
            end_idx = raw_output.rfind('}')
            if start_idx != -1 and end_idx != -1 and end_idx > start_idx:
                json_str = raw_output[start_idx:end_idx+1]
            else:
                json_str = raw_output
                
            data_dict = json.loads(json_str)
            return NetworkResponse(**data_dict)
        except json.JSONDecodeError as je:
            logger.error(f"Failed to parse LLM output as JSON. Output: {raw_output}")
            raise ValueError("LLM returned malformed JSON.")
        except Exception as ve:
            logger.error(f"Validation error: {ve}")
            raise ValueError(f"LLM output does not match schema: {ve}")
        
    except Exception as e:
        logger.error(f"Network Analysis Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
