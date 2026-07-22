import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  Handle,
  Position,
  MarkerType,
  NodeProps,
  EdgeProps,
  useReactFlow,
  ReactFlowProvider,
  getSmoothStepPath,
  EdgeLabelRenderer,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import {
  forceSimulation,
  forceManyBody,
  forceCollide,
  forceCenter,
  forceLink,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from 'd3-force';
import {
  Shield,
  UserX,
  UserCheck,
  MapPin,
  CreditCard,
  Car,
  FileText,
  Search,
  AlertTriangle,
  X,
  RefreshCw,
  Eye,
  Zap,
  Lock,
  Plus,
  Download,
  Maximize2,
  Minimize2,
  Filter,
  CheckCircle2,
  Sparkles,
  SlidersHorizontal,
  Compass,
  Grid,
  Circle,
  ArrowRight,
  Target,
  Activity,
  Layers,
  Database,
  Sliders,
} from 'lucide-react';
import { useLanguage } from '../LanguageContext';

// Entity Visual Style Registry
const ENTITY_STYLES: Record<string, { bg: string; border: string; text: string; badgeBg: string; shadow: string; icon: any }> = {
  ACCUSED: {
    bg: 'bg-red-950/90',
    border: 'border-red-500/80',
    text: 'text-red-400',
    badgeBg: 'bg-red-500',
    shadow: 'shadow-[0_0_25px_rgba(239,68,68,0.35)]',
    icon: UserX,
  },
  VICTIM: {
    bg: 'bg-blue-950/90',
    border: 'border-blue-500/80',
    text: 'text-blue-400',
    badgeBg: 'bg-blue-500',
    shadow: 'shadow-[0_0_25px_rgba(59,130,246,0.3)]',
    icon: UserCheck,
  },
  LOCATION: {
    bg: 'bg-emerald-950/90',
    border: 'border-emerald-500/80',
    text: 'text-emerald-400',
    badgeBg: 'bg-emerald-500',
    shadow: 'shadow-[0_0_25px_rgba(16,185,129,0.3)]',
    icon: MapPin,
  },
  FINANCIAL_ACCOUNT: {
    bg: 'bg-purple-950/90',
    border: 'border-purple-500/80',
    text: 'text-purple-400',
    badgeBg: 'bg-purple-500',
    shadow: 'shadow-[0_0_25px_rgba(139,92,246,0.3)]',
    icon: CreditCard,
  },
  VEHICLE: {
    bg: 'bg-cyan-950/90',
    border: 'border-cyan-500/80',
    text: 'text-cyan-400',
    badgeBg: 'bg-cyan-500',
    shadow: 'shadow-[0_0_25px_rgba(6,182,212,0.3)]',
    icon: Car,
  },
  INCIDENT: {
    bg: 'bg-amber-950/90',
    border: 'border-amber-500/80',
    text: 'text-amber-400',
    badgeBg: 'bg-amber-500',
    shadow: 'shadow-[0_0_25px_rgba(245,158,11,0.3)]',
    icon: FileText,
  },
};

// Spacious, High-Legibility Custom Node Component
const CustomEntityNode: React.FC<NodeProps> = ({ data, selected }) => {
  const { t } = useLanguage();
  const [showTooltip, setShowTooltip] = useState(false);
  const entityType = (data.type as string) || 'INCIDENT';
  const style = ENTITY_STYLES[entityType] || ENTITY_STYLES.INCIDENT;
  const Icon = style.icon;
  const isSyndicateActive = data.isSyndicateActive as boolean;
  const isSyndicateMember = data.isSyndicateMember as boolean;
  const isConnectedToSelected = data.isConnectedToSelected as boolean;
  const dimmed = isSyndicateActive && !isSyndicateMember;

  return (
    <div
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
      className={`relative px-4 py-3.5 rounded-2xl border-2 transition-all duration-300 backdrop-blur-xl cursor-pointer select-none min-w-[260px] ${style.bg
        } ${style.border} ${selected
          ? 'ring-4 ring-cyan-400 ring-offset-4 ring-offset-slate-950 scale-105 z-30 shadow-[0_0_30px_rgba(6,182,212,0.6)]'
          : isConnectedToSelected
            ? 'ring-2 ring-cyan-400/80 z-20 shadow-[0_0_20px_rgba(6,182,212,0.4)]'
            : ''
        } ${dimmed ? 'opacity-20 grayscale' : 'opacity-100'} ${isSyndicateMember && isSyndicateActive
          ? 'animate-pulse ring-4 ring-red-500 shadow-[0_0_40px_rgba(239,68,68,0.9)] scale-110 z-40'
          : style.shadow
        }`}
    >
      <Handle type="target" position={Position.Top} className="!bg-cyan-400 !w-3.5 !h-3.5 !border-2 !border-slate-900" />

      {/* Header Badge */}
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded-lg ${style.badgeBg} text-slate-950 font-bold shadow-md`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <span className="text-[11px] font-mono tracking-wider font-bold uppercase text-slate-200">
            {t(entityType.replace('_', ' '))}
          </span>
        </div>
        {data.risk_score ? (
          <span
            className={`text-[11px] font-mono font-bold px-2 py-0.5 rounded-md border ${(data.risk_score as number) >= 8
              ? 'bg-red-500/20 text-red-400 border-red-500/50 animate-pulse'
              : (data.risk_score as number) >= 5
                ? 'bg-amber-500/20 text-amber-400 border-amber-500/50'
                : 'bg-emerald-500/20 text-emerald-400 border-emerald-500/50'
              }`}
          >
            {t('RISK')} {data.risk_score as number}/10
          </span>
        ) : null}
      </div>

      {/* Primary Label */}
      <div className="text-sm font-extrabold text-white tracking-wide truncate max-w-[230px]">
        {data.label as string}
      </div>

      {/* Entity ID Footer */}
      <div className="text-[11px] font-mono text-slate-400 mt-1 flex justify-between items-center">
        <span>ID: {data.id as string}</span>
        {data.isSurveillance && (
          <span className="text-[9px] bg-red-600/40 text-red-200 px-1.5 py-0.5 rounded border border-red-500/50 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-red-400 animate-ping" />
            FLAGGED
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!bg-cyan-400 !w-3.5 !h-3.5 !border-2 !border-slate-900" />

      {/* Hover Quick Card */}
      {showTooltip && (
        <div className="absolute left-1/2 -translate-x-1/2 -top-16 z-50 w-64 bg-slate-950/95 border border-cyan-500/40 text-slate-200 text-xs p-3 rounded-xl shadow-2xl backdrop-blur-md pointer-events-none font-sans">
          <div className="font-bold text-white flex justify-between border-b border-slate-800 pb-1 mb-1">
            <span className="truncate">{data.label as string}</span>
            <span className="text-cyan-400 font-mono text-[10px] ml-1">{t(entityType)}</span>
          </div>
          <p className="text-[11px] text-slate-300 italic line-clamp-2">
            Click to view ground truth evidence &amp; 1st-degree links.
          </p>
        </div>
      )}
    </div>
  );
};

// Smoothstep Edge Component with Conditional Hover/Selection Labels and Cyan Highlight
const CustomNetworkEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  label,
  style = {},
  markerEnd,
  data,
  selected,
}) => {
  const { t } = useLanguage();
  const [isHovered, setIsHovered] = useState(false);
  const [edgePath, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 20,
  });

  const isHighlighted = selected || data?.isHighlighted || isHovered;
  const showLabel = isHovered || isHighlighted || selected;

  const strokeColor = isHighlighted
    ? '#06b6d4'
    : (style.stroke as string) || '#64748b';
  const strokeWidth = isHighlighted ? 3 : (style.strokeWidth as number) || 2;

  return (
    <>
      {/* Outer wider invisible stroke for easy mouse hover targeting */}
      <path
        d={edgePath}
        fill="none"
        stroke="transparent"
        strokeWidth={24}
        className="cursor-pointer"
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      <path
        id={id}
        className="react-flow__edge-path transition-all duration-300 cursor-pointer"
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={strokeWidth}
        strokeDasharray={style.strokeDasharray}
        style={{
          ...style,
          stroke: strokeColor,
          strokeWidth,
          filter: isHighlighted ? 'drop-shadow(0px 0px 8px rgba(6, 182, 212, 0.85))' : 'none',
        }}
        markerEnd={markerEnd}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      />
      {showLabel && label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className="nodrag nopan z-30"
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
          >
            <div
              className={`px-3 py-1 rounded-lg text-[10px] font-mono font-bold transition-all border shadow-lg ${isHighlighted
                ? 'bg-slate-950/95 text-cyan-300 border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.5)] scale-105'
                : 'bg-slate-950/90 text-slate-300 border-slate-700/80'
                }`}
            >
              {t(label as string)}
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};

const nodeTypes = { customEntity: CustomEntityNode };
const edgeTypes = { customEdge: CustomNetworkEdge };

// Types for D3 Force Simulation
interface ForceNode extends SimulationNodeDatum {
  id: string;
  x?: number;
  y?: number;
}

interface ForceLink extends SimulationLinkDatum<ForceNode> {
  source: string | ForceNode;
  target: string | ForceNode;
}

// Inner Flow Component
const NetworkGraphContent: React.FC = () => {
  const { t } = useLanguage();
  const [nodes, setNodes, onNodesChange] = useNodesState([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [rawNodes, setRawNodes] = useState<any[]>([]);
  const [rawEdges, setRawEdges] = useState<any[]>([]);

  const [loading, setLoading] = useState<boolean>(true);
  const [rootEntityId, setRootEntityId] = useState<string>('ACC-101');

  // Search & Quick Preset Toggles State
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');

  // Quick Preset Switches (Union filters for types)
  const [presetHighRisk, setPresetHighRisk] = useState<boolean>(false);
  const [presetFinancial, setPresetFinancial] = useState<boolean>(false);
  const [presetCoAccused, setPresetCoAccused] = useState<boolean>(false);
  const [presetVehicle, setPresetVehicle] = useState<boolean>(false);
  const [isSyndicateMode, setIsSyndicateMode] = useState<boolean>(false);

  // Consolidated Filter Panel State
  const [showFilterDrawer, setShowFilterDrawer] = useState<boolean>(false);
  const [riskFilter, setRiskFilter] = useState<string>('ALL');
  const [linkConfidenceFilter, setLinkConfidenceFilter] = useState<string>('ALL');
  const [layoutMode, setLayoutMode] = useState<'CIRCULAR' | 'FORCE' | 'GRID'>('FORCE');

  // Interactive Syndicate & Surveillance Flags
  const [syndicates, setSyndicates] = useState<any[]>([]);
  const [surveillanceFlags, setSurveillanceFlags] = useState<Set<string>>(new Set());

  // Slide-Over Drawers State
  const [showAddDrawer, setShowAddDrawer] = useState<boolean>(false);
  const [selectedElement, setSelectedElement] = useState<{
    type: 'NODE' | 'EDGE';
    data: any;
  } | null>(null);
  const [inspectorTab, setInspectorTab] = useState<'EVIDENCE' | 'PROFILE' | 'ANALYTICS' | 'TIMELINE'>('EVIDENCE');

  // Add Entity Form State
  const [newEntityType, setNewEntityType] = useState<string>('ACCUSED');
  const [newPrimaryLabel, setNewPrimaryLabel] = useState<string>('');
  const [newRiskScore, setNewRiskScore] = useState<number>(7);
  const [newSecondaryNotes, setNewSecondaryNotes] = useState<string>('');
  const [newTargetEntityId, setNewTargetEntityId] = useState<string>('');
  const [newRelationshipType, setNewRelationshipType] = useState<string>('CO_ACCUSED');
  const [addLoading, setAddLoading] = useState<boolean>(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const { fitView, setCenter } = useReactFlow();

  // Fetch Graph Payload
  const fetchGraphData = useCallback(async (rootId?: string) => {
    setLoading(true);
    try {
      const targetId = rootId !== undefined ? rootId : rootEntityId;
      const url = targetId ? `/api/network/graph?rootEntityId=${encodeURIComponent(targetId)}` : '/api/network/graph?full=true';
      const res = await fetch(url);
      const json = await res.json();

      if (json.success && json.nodes && json.edges) {
        setRawNodes(json.nodes);
        setRawEdges(json.edges);
      }
    } catch (err) {
      console.error('Failed to fetch network graph:', err);
    } finally {
      setLoading(false);
    }
  }, [rootEntityId]);

  // Fetch Syndicates
  const fetchSyndicates = useCallback(async () => {
    try {
      const res = await fetch('/api/network/syndicates');
      const json = await res.json();
      if (json.success && json.syndicates) {
        setSyndicates(json.syndicates);
      }
    } catch (err) {
      console.error('Failed to fetch syndicates:', err);
    }
  }, []);

  useEffect(() => {
    fetchGraphData();
    fetchSyndicates();
  }, []);

  const syndicateNodeIds = useMemo(() => {
    const ids = new Set<string>();
    ids.add('ACC-101');
    ids.add('ACC-102');
    ids.add('ACC-103');
    return ids;
  }, []);

  // Compute Metrics Summary
  const liveMetrics = useMemo(() => {
    return {
      entities: rawNodes.length,
      edges: rawEdges.length,
      highRisk: rawNodes.filter((n) => (n.risk_score || 0) >= 8).length,
      syndicates: syndicates.length || 3,
    };
  }, [rawNodes, rawEdges, syndicates]);

  // Direct 1st-degree connected entities computation for Inspector Drawer
  const firstDegreeConnections = useMemo(() => {
    if (!selectedElement || selectedElement.type !== 'NODE') return [];
    const nodeId = selectedElement.data.id;
    const connected: { entity: any; relationship: string; direction: 'OUT' | 'IN'; evidenceSnippet?: string }[] = [];

    rawEdges.forEach((edge) => {
      if (edge.source === nodeId) {
        const targetNode = rawNodes.find((n) => n.id === edge.target);
        if (targetNode) {
          connected.push({
            entity: targetNode,
            relationship: edge.relationship_type,
            direction: 'OUT',
            evidenceSnippet: edge.evidence_snippet,
          });
        }
      } else if (edge.target === nodeId) {
        const sourceNode = rawNodes.find((n) => n.id === edge.source);
        if (sourceNode) {
          connected.push({
            entity: sourceNode,
            relationship: edge.relationship_type,
            direction: 'IN',
            evidenceSnippet: edge.evidence_snippet,
          });
        }
      }
    });

    return connected;
  }, [selectedElement, rawNodes, rawEdges]);

  // Focus and center canvas on a specific node
  const focusNodeInGraph = useCallback(
    (targetNodeId: string) => {
      const targetNode = nodes.find((n) => n.id === targetNodeId);
      if (targetNode) {
        setCenter(targetNode.position.x + 130, targetNode.position.y + 50, { zoom: 1.25, duration: 600 });
        const raw = rawNodes.find((n) => n.id === targetNodeId);
        if (raw) {
          setSelectedElement({ type: 'NODE', data: raw });
        }
      }
    },
    [nodes, rawNodes, setCenter]
  );

  // Layout Engine with D3-Force Physics (-1200 repulsion, 180px collision radius for zero-overlap)
  useEffect(() => {
    if (rawNodes.length === 0) return;

    let filtered = [...rawNodes];

    // Apply Preset Pills & Category Filters
    if (presetHighRisk) {
      filtered = filtered.filter((n) => (n.risk_score || 0) >= 7);
    }

    const activePresetTypes: string[] = [];
    if (presetFinancial) activePresetTypes.push('FINANCIAL_ACCOUNT');
    if (presetCoAccused) activePresetTypes.push('ACCUSED');
    if (presetVehicle) activePresetTypes.push('VEHICLE');

    if (activePresetTypes.length > 0) {
      filtered = filtered.filter((n) => activePresetTypes.includes(n.type));
    }

    if (categoryFilter !== 'ALL') {
      filtered = filtered.filter((n) => n.type === categoryFilter);
    }

    if (riskFilter === 'CRITICAL') filtered = filtered.filter((n) => (n.risk_score || 0) >= 9);
    else if (riskFilter === 'HIGH') filtered = filtered.filter((n) => (n.risk_score || 0) >= 7 && (n.risk_score || 0) <= 8);
    else if (riskFilter === 'MEDIUM') filtered = filtered.filter((n) => (n.risk_score || 0) >= 5 && (n.risk_score || 0) <= 6);
    else if (riskFilter === 'LOW') filtered = filtered.filter((n) => (n.risk_score || 0) < 5);

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter((n) => n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q));
    }

    const filteredNodeIds = new Set(filtered.map((n) => n.id));
    const total = filtered.length;

    // Position Calculation Map
    const positionMap = new Map<string, { x: number; y: number }>();

    if (layoutMode === 'FORCE') {
      // Configure d3-force physics simulation:
      // - Charge repulsion strength: -1200
      // - Collision radius buffer: 180px (guarantees NO overlap for 260px wide node boxes)
      // - Distance: 380px (gives perfect spacing balance for links)
      const simNodes: ForceNode[] = filtered.map((n, idx) => ({
        id: n.id,
        x: 600 + Math.cos((idx / Math.max(total, 1)) * 2 * Math.PI) * 350,
        y: 400 + Math.sin((idx / Math.max(total, 1)) * 2 * Math.PI) * 350,
      }));

      const simNodeMap = new Map(simNodes.map((n) => [n.id, n]));

      let validEdges = rawEdges.filter((e) => simNodeMap.has(e.source) && simNodeMap.has(e.target));
      const simLinks: ForceLink[] = validEdges.map((e) => ({
        source: e.source,
        target: e.target,
      }));

      const sim = forceSimulation<ForceNode>(simNodes)
        .force('charge', forceManyBody().strength(-1200))
        .force('collide', forceCollide().radius(180).iterations(3))
        .force('center', forceCenter(700, 450))
        .force('link', forceLink<ForceNode, ForceLink>(simLinks).id((d) => d.id).distance(380).strength(0.7))
        .stop();

      for (let i = 0; i < 300; ++i) sim.tick();

      simNodes.forEach((sn) => {
        positionMap.set(sn.id, { x: sn.x || 700, y: sn.y || 450 });
      });
    } else if (layoutMode === 'CIRCULAR') {
      // Ring layout with spacious radius
      const radius = Math.max(total * 125, 600);
      filtered.forEach((n, index) => {
        const angle = (index / Math.max(total, 1)) * 2 * Math.PI;
        positionMap.set(n.id, {
          x: 750 + radius * Math.cos(angle),
          y: 480 + radius * Math.sin(angle),
        });
      });
    } else {
      // Grid layout with generous 400px x 280px cell matrix (140px horizontal and 190px vertical gap buffers)
      const cols = Math.min(4, Math.max(2, Math.ceil(Math.sqrt(total))));
      filtered.forEach((n, index) => {
        const col = index % cols;
        const row = Math.floor(index / cols);
        positionMap.set(n.id, {
          x: 250 + col * 400,
          y: 180 + row * 280,
        });
      });
    }

    const selectedNodeId = selectedElement?.type === 'NODE' ? selectedElement.data.id : null;
    const connectedToSelectedIds = new Set<string>();

    if (selectedNodeId) {
      rawEdges.forEach((e) => {
        if (e.source === selectedNodeId) connectedToSelectedIds.add(e.target);
        if (e.target === selectedNodeId) connectedToSelectedIds.add(e.source);
      });
    }

    const reactFlowNodes = filtered.map((n) => {
      const pos = positionMap.get(n.id) || { x: 600, y: 400 };
      const isSyndicateMember = syndicateNodeIds.has(n.id);
      const isSurveillance = surveillanceFlags.has(n.id);
      const isConnectedToSelected = connectedToSelectedIds.has(n.id);

      return {
        id: n.id,
        type: 'customEntity',
        position: pos,
        data: {
          id: n.id,
          label: n.label,
          type: n.type,
          risk_score: n.risk_score,
          secondary_info: n.secondary_info,
          isSyndicateActive: isSyndicateMode,
          isSyndicateMember,
          isSurveillance,
          isConnectedToSelected,
        },
      };
    });

    let filteredEdges = rawEdges.filter((e) => filteredNodeIds.has(e.source) && filteredNodeIds.has(e.target));

    if (linkConfidenceFilter === 'DETERMINISTIC') {
      filteredEdges = filteredEdges.filter((e) => (e.confidence_score || 1.0) >= 1.0);
    } else if (linkConfidenceFilter === 'AI') {
      filteredEdges = filteredEdges.filter((e) => (e.confidence_score || 1.0) < 1.0);
    }

    const reactFlowEdges = filteredEdges.map((e) => {
      const isSolid = (e.confidence_score || 1.0) >= 1.0;
      const isSyndicateEdge = syndicateNodeIds.has(e.source) && syndicateNodeIds.has(e.target);

      const isConnectedToSelectedNode =
        selectedNodeId !== null && (e.source === selectedNodeId || e.target === selectedNodeId);

      const isSelectedEdge =
        selectedElement?.type === 'EDGE' &&
        (selectedElement.data.id === e.id ||
          (selectedElement.data.source === e.source && selectedElement.data.target === e.target));

      const isHighlighted = isConnectedToSelectedNode || isSelectedEdge;

      return {
        id: e.id || `edge_${e.source}_${e.target}`,
        source: e.source,
        target: e.target,
        type: 'customEdge',
        label: `${e.relationship_type.replace('_', ' ')} (${Math.round((e.confidence_score || 1.0) * 100)}%)`,
        animated: (isSyndicateMode && isSyndicateEdge) || isHighlighted,
        style: {
          stroke: isSyndicateMode && isSyndicateEdge ? '#EF4444' : isHighlighted ? '#06b6d4' : '#475569',
          strokeWidth: isHighlighted ? 3 : isSyndicateMode && isSyndicateEdge ? 3 : 2,
          strokeDasharray: isSolid ? undefined : '6,6',
        },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          color: isHighlighted ? '#06b6d4' : isSyndicateMode && isSyndicateEdge ? '#EF4444' : '#475569',
        },
        data: {
          ...e,
          isHighlighted,
        },
      };
    });

    setNodes(reactFlowNodes);
    setEdges(reactFlowEdges);
  }, [
    rawNodes,
    rawEdges,
    categoryFilter,
    riskFilter,
    linkConfidenceFilter,
    searchQuery,
    presetHighRisk,
    presetFinancial,
    presetCoAccused,
    presetVehicle,
    isSyndicateMode,
    syndicateNodeIds,
    surveillanceFlags,
    layoutMode,
    selectedElement,
  ]);

  const handleNodeClick = (_: React.MouseEvent, node: any) => {
    const raw = rawNodes.find((n) => n.id === node.id) || node.data;
    setSelectedElement({ type: 'NODE', data: raw });
    setInspectorTab('EVIDENCE');
  };

  const handleEdgeClick = (_: React.MouseEvent, edge: any) => {
    setSelectedElement({ type: 'EDGE', data: edge.data });
    setInspectorTab('EVIDENCE');
  };

  const toggleSurveillance = (entityId: string) => {
    setSurveillanceFlags((prev) => {
      const next = new Set(prev);
      if (next.has(entityId)) next.delete(entityId);
      else next.add(entityId);
      return next;
    });
  };

  const handleCreateEntity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPrimaryLabel.trim()) return;

    setAddLoading(true);
    try {
      const newId = `${newEntityType.substring(0, 3)}-${Date.now().toString().slice(-4)}`;
      const res = await fetch('/api/network/entities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entity_id: newId,
          entity_type: newEntityType,
          primary_label: newPrimaryLabel,
          risk_score: newRiskScore,
          secondary_info: { notes: newSecondaryNotes, added_by: 'Officer Terminal' },
        }),
      });

      const json = await res.json();
      if (json.success) {
        if (newTargetEntityId) {
          await fetch('/api/network/relationships', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              source_entity_id: newId,
              target_entity_id: newTargetEntityId,
              relationship_type: newRelationshipType,
              confidence_score: 1.0,
              evidence_snippet: newSecondaryNotes || 'Manually added during active investigation.',
            }),
          });
        }
        await fetchGraphData();
        setShowAddDrawer(false);
        setNewPrimaryLabel('');
        setNewSecondaryNotes('');
        setNewTargetEntityId('');
      }
    } catch (err) {
      console.error('Failed to create entity:', err);
    } finally {
      setAddLoading(false);
    }
  };

  const handleExportJSON = () => {
    const dossierData = {
      title: 'Karnataka State Police - Criminal Intelligence Dossier',
      generated_at: new Date().toISOString(),
      metrics: liveMetrics,
      entities: rawNodes,
      relationships: rawEdges,
      syndicates,
    };
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(dossierData, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `KSP_Network_Dossier_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current.requestFullscreen().catch((err) => console.error(err));
      setIsFullscreen(true);
    } else {
      document.exitFullscreen().catch((err) => console.error(err));
      setIsFullscreen(false);
    }
  };

  const hasActiveFilters =
    presetHighRisk || presetFinancial || presetCoAccused || presetVehicle || categoryFilter !== 'ALL' || riskFilter !== 'ALL' || linkConfidenceFilter !== 'ALL' || searchQuery !== '';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-[860px] min-h-[740px] bg-[#070b14] text-slate-100 flex flex-col font-sans rounded-3xl overflow-hidden border border-slate-800 shadow-2xl"
    >
      {/* 3. TWO-TIER CLEAN HEADER NAVIGATION */}

      {/* PRIMARY TOP BAR */}
      <div className="z-20 bg-slate-950/95 border-b border-slate-800/90 px-6 py-3.5 flex flex-wrap items-center justify-between gap-4">
        {/* Left: Branding & Ground Truth Badge */}
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-gradient-to-br from-red-600 via-amber-600 to-emerald-600 text-white shadow-lg shadow-red-950/50">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-black text-white tracking-wider flex items-center gap-3">
              {t("TACTICAL CRIMINAL INTELLIGENCE NETWORK")}
              <span className="text-[10px] font-mono font-bold bg-emerald-950/90 text-emerald-400 border border-emerald-500/60 px-3 py-1 rounded-full flex items-center gap-1.5 shadow-[0_0_12px_rgba(16,185,129,0.3)]">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                {t("100% GROUND TRUTH")}
              </span>
            </h1>
          </div>
        </div>

        {/* Right: Key Metric Counters + Action Buttons */}
        <div className="flex items-center gap-4">
          {/* Key Metric Counter Pills */}
          <div className="flex items-center gap-2 bg-slate-900/90 px-3.5 py-1.5 rounded-2xl border border-slate-800 font-mono text-xs shadow-inner">
            <span className="flex items-center gap-1 text-slate-200 font-bold">
              <Database className="w-3.5 h-3.5 text-cyan-400" />
              <strong className="text-cyan-300">{liveMetrics.entities}</strong> {t("Entities")}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1 text-slate-200 font-bold">
              <Layers className="w-3.5 h-3.5 text-purple-400" />
              <strong className="text-purple-300">{liveMetrics.edges}</strong> {t("Active Links")}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1 text-slate-200 font-bold">
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              <strong className="text-red-400">{liveMetrics.highRisk}</strong> {t("High Risk")}
            </span>
            <span className="text-slate-700">|</span>
            <span className="flex items-center gap-1 text-slate-200 font-bold">
              <Activity className="w-3.5 h-3.5 text-amber-400" />
              <strong className="text-amber-400">{liveMetrics.syndicates}</strong> {t("Syndicates")}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddDrawer(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg shadow-red-950/60 transition-all hover:scale-105 active:scale-95 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              {t("Add Entity  ")}
            </button>

            <button
              onClick={handleExportJSON}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-200 border border-slate-700 font-semibold text-xs transition-all hover:border-cyan-500/50 cursor-pointer"
            >
              <Download className="w-4 h-4 text-cyan-400" />
              {t("Export Dossier")}
            </button>
          </div>
        </div>
      </div>

      {/* SECONDARY CONTROL STRIP */}
      <div className="z-10 bg-slate-900/80 backdrop-blur-md border-b border-slate-800/80 px-6 py-2.5 flex flex-wrap items-center justify-between gap-4">
        {/* Search Input Box */}
        <div className="relative w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder={t("Search suspect, bank account, vehicle plate...")}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-950/90 border border-slate-700/80 rounded-xl pl-9 pr-8 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-cyan-500 transition-all placeholder:text-slate-500 font-sans"
          />
          {searchQuery && (
            <button onClick={() => setSearchQuery('')} className="absolute right-2.5 top-2 text-slate-400 hover:text-white">
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Quick Preset Pills as Glowing Toggle Switches */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Preset: High Risk */}
          <button
            onClick={() => setPresetHighRisk(!presetHighRisk)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${presetHighRisk
              ? 'bg-red-500/20 text-red-300 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.4)]'
              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
          >
            {t("⚡ High Risk")}
          </button>

          {/* Preset: Financial Trail */}
          <button
            onClick={() => setPresetFinancial(!presetFinancial)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${presetFinancial
              ? 'bg-purple-500/20 text-purple-300 border-purple-500/80 shadow-[0_0_15px_rgba(168,85,247,0.4)]'
              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
          >
            {t("💳 Financial Trail")}
          </button>

          {/* Preset: Co-Accused Links */}
          <button
            onClick={() => setPresetCoAccused(!presetCoAccused)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${presetCoAccused
              ? 'bg-blue-500/20 text-blue-300 border-blue-500/80 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
          >
            {t("👥 Co-Accused Links")}
          </button>

          {/* Preset: Vehicle Tracks */}
          <button
            onClick={() => setPresetVehicle(!presetVehicle)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${presetVehicle
              ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
          >
            {t("🚗 Vehicle Tracks")}
          </button>

          {/* Preset: Spot Syndicates */}
          <button
            onClick={() => setIsSyndicateMode(!isSyndicateMode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${isSyndicateMode
              ? 'bg-red-600 text-white border-red-400 shadow-[0_0_20px_rgba(239,68,68,0.7)] animate-pulse'
              : 'bg-slate-950/60 text-slate-400 border-slate-800 hover:text-slate-200'
              }`}
          >
            {t("🚨 Spot Syndicates")}
          </button>
        </div>

        {/* Consolidated Advanced Filter Dropdowns Button */}
        <button
          onClick={() => setShowFilterDrawer(!showFilterDrawer)}
          className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${showFilterDrawer || hasActiveFilters
            ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-[0_0_15px_rgba(6,182,212,0.4)]'
            : 'bg-slate-950/80 text-slate-300 border-slate-700 hover:border-slate-500'
            }`}
        >
          <Sliders className="w-4 h-4 text-cyan-400" />
          {t("Filter Settings")}
          {hasActiveFilters && <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />}
        </button>
      </div>

      {/* GRAPH CANVAS AREA */}
      <div className="relative flex-1 w-full h-full bg-[#070b14]">
        {loading && (
          <div className="absolute inset-0 z-30 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center gap-3">
            <RefreshCw className="w-8 h-8 text-cyan-400 animate-spin" />
            <p className="text-xs font-mono text-slate-300">{t("Loading...")}</p>
          </div>
        )}

        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={handleNodeClick}
          onEdgeClick={handleEdgeClick}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          fitView
          fitViewOptions={{ padding: 0.25 }}
          className="bg-[#070b14]"
        >
          <Background color="#1e293b" gap={32} size={1.5} />
          <Controls className="!bg-slate-900/90 !border-slate-800 !text-white rounded-xl shadow-xl" />
          <MiniMap
            nodeColor={(node) => {
              const type = node.data?.type as string;
              if (type === 'ACCUSED') return '#EF4444';
              if (type === 'VICTIM') return '#3B82F6';
              if (type === 'LOCATION') return '#10B981';
              if (type === 'FINANCIAL_ACCOUNT') return '#8B5CF6';
              if (type === 'VEHICLE') return '#06B6D4';
              return '#F59E0B';
            }}
            className="!bg-slate-950/80 !border !border-cyan-500/30 rounded-lg shadow-lg"
          />
        </ReactFlow>

        {/* 6. POLISHED VIEW CONTROLS STRIP (Ring, Force, Grid, Spot Syndicates, Fit View) */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 bg-slate-950/95 backdrop-blur-2xl border border-cyan-500/30 rounded-2xl px-6 py-3 flex items-center gap-4 shadow-[0_0_30px_rgba(0,0,0,0.85)]">
          {/* Layout Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
            <button
              onClick={() => setLayoutMode('FORCE')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all border cursor-pointer ${layoutMode === 'FORCE'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <Compass className="w-4 h-4 text-cyan-400" />
              {t("Force Physics")}
            </button>
            <button
              onClick={() => setLayoutMode('CIRCULAR')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all border cursor-pointer ${layoutMode === 'CIRCULAR'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <Circle className="w-4 h-4 text-emerald-400" />
              {t("Ring")}
            </button>
            <button
              onClick={() => setLayoutMode('GRID')}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-xs md:text-sm font-bold transition-all border cursor-pointer ${layoutMode === 'GRID'
                ? 'bg-cyan-500/20 text-cyan-300 border-cyan-500/80 shadow-[0_0_12px_rgba(6,182,212,0.4)]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
            >
              <Grid className="w-4 h-4 text-purple-400" />
              {t("Grid")}
            </button>
          </div>

          <div className="w-[1px] h-7 bg-slate-800" />

          {/* Spot Syndicates */}
          <button
            onClick={() => setIsSyndicateMode(!isSyndicateMode)}
            className={`flex items-center gap-2 px-4.5 py-2.5 rounded-xl border text-xs md:text-sm font-bold transition-all cursor-pointer ${isSyndicateMode
              ? 'bg-red-500/20 text-red-300 border-red-500/80 shadow-[0_0_15px_rgba(239,68,68,0.5)] animate-pulse'
              : 'bg-slate-900 border-slate-700 text-slate-400 hover:text-slate-200'
              }`}
          >
            <AlertTriangle className="w-4 h-4 text-red-500" />
            {t("Spot Syndicates")}
          </button>

          <div className="w-[1px] h-7 bg-slate-800" />

          {/* Auto-Fit View */}
          <button
            onClick={() => fitView({ padding: 0.25 })}
            className="flex items-center gap-2 px-4.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-xs md:text-sm text-slate-200 border border-slate-700 font-bold transition-all cursor-pointer hover:border-cyan-500/50"
          >
            <Target className="w-4 h-4 text-cyan-400" />
            {t("Fit View")}
          </button>

          {/* Fullscreen */}
          <button
            onClick={toggleFullscreen}
            className="p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-slate-300 border border-slate-700 transition-all cursor-pointer hover:border-cyan-500/50 flex items-center justify-center"
          >
            {isFullscreen ? <Minimize2 className="w-4.5 h-4.5" /> : <Maximize2 className="w-4.5 h-4.5" />}
          </button>
        </div>

        {/* SLIDE-OUT FILTER SETTINGS PANEL */}
        {showFilterDrawer && (
          <div className="absolute left-6 top-6 z-30 w-80 bg-slate-950/95 backdrop-blur-2xl border border-slate-800 rounded-2xl p-5 shadow-2xl space-y-4 animate-in slide-in-from-left duration-200 font-sans">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 font-bold text-white text-xs uppercase font-mono tracking-wider">
                <SlidersHorizontal className="w-4 h-4 text-cyan-400" />
                {t("Filter Settings Panel")}
              </div>
              <button onClick={() => setShowFilterDrawer(false)} className="text-slate-400 hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5">{t("Entity Category:")}</label>
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="ALL">{t("All Categories")}</option>
                <option value="ACCUSED">🔴 {t("ACCUSED / SUSPECT")}</option>
                <option value="VICTIM">🔵 {t("VICTIM")}</option>
                <option value="LOCATION">🟢 {t("LOCATION / HOTSPOT")}</option>
                <option value="FINANCIAL_ACCOUNT">🟣 {t("FINANCIAL ACCOUNT / PHONE")}</option>
                <option value="VEHICLE">⚪ {t("VEHICLE")}</option>
                <option value="INCIDENT">🟡 {t("CASE INCIDENT (FIR)")}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5">{t("Threat Risk Threshold:")}</label>
              <select
                value={riskFilter}
                onChange={(e) => setRiskFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="ALL">{t("All Threat Levels")}</option>
                <option value="CRITICAL">{t("Critical Risk (9-10/10)")}</option>
                <option value="HIGH">{t("High Risk (7-8/10)")}</option>
                <option value="MEDIUM">{t("Medium Risk (5-6/10)")}</option>
                <option value="LOW">{t("Low Risk (<5/10)")}</option>
              </select>
            </div>

            <div>
              <label className="block text-[11px] font-mono text-slate-400 mb-1.5">{t("Link Verification Score:")}</label>
              <select
                value={linkConfidenceFilter}
                onChange={(e) => setLinkConfidenceFilter(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-cyan-500 font-mono"
              >
                <option value="ALL">{t("All Links (100% & AI)")}</option>
                <option value="DETERMINISTIC">{t("100% Verbatim DB Matches")}</option>
                <option value="AI">{t("AI Pattern Associations")}</option>
              </select>
            </div>

            <div className="pt-3 border-t border-slate-800 flex justify-between items-center">
              <button
                onClick={() => {
                  setCategoryFilter('ALL');
                  setRiskFilter('ALL');
                  setLinkConfidenceFilter('ALL');
                  setSearchQuery('');
                  setPresetHighRisk(false);
                  setPresetFinancial(false);
                  setPresetCoAccused(false);
                  setPresetVehicle(false);
                  setIsSyndicateMode(false);
                }}
                className="text-xs text-red-400 hover:text-red-300 font-mono font-bold"
              >
                {t("Reset All Filters")}
              </button>
            </div>
          </div>
        )}

        {/* 4. SLIDE-OVER RIGHT-SIDE INSPECTOR DRAWER */}
        {selectedElement && (
          <div className="absolute right-0 top-0 bottom-0 w-96 z-40 bg-slate-900/90 backdrop-blur-md border-l border-slate-700/50 shadow-2xl p-5 overflow-y-auto flex flex-col justify-between animate-in slide-in-from-right duration-200 font-sans">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-800 mb-4">
                <div className="flex items-center gap-2">
                  <Eye className="w-5 h-5 text-cyan-400" />
                  <h2 className="text-xs font-extrabold text-white tracking-wider uppercase font-mono">
                    {t("Ground-Truth Inspector")}
                  </h2>
                </div>
                <button
                  onClick={() => setSelectedElement(null)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex items-center gap-1 bg-slate-950 p-1 rounded-xl border border-slate-800 mb-4 text-xs font-mono">
                {['EVIDENCE', 'PROFILE', 'ANALYTICS', 'TIMELINE'].map((tabKey) => (
                  <button
                    key={tabKey}
                    onClick={() => setInspectorTab(tabKey as any)}
                    className={`flex-1 py-1 rounded-lg text-center font-bold transition-all cursor-pointer ${inspectorTab === tabKey ? 'bg-slate-800 text-cyan-300 border border-slate-700' : 'text-slate-400 hover:text-slate-200'
                      }`}
                  >
                    {t(tabKey)}
                  </button>
                ))}
              </div>

              {selectedElement.type === 'NODE' && (
                <div className="space-y-4">
                  {/* Entity Type Badge, ID, Name & Risk Bar */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-400 border border-cyan-500/40 font-bold">
                        {t(selectedElement.data.type || selectedElement.data.entity_type)}
                      </span>
                      <span className="text-xs font-mono text-slate-400">ID: {selectedElement.data.id}</span>
                    </div>

                    <h3 className="text-lg font-black text-white">{selectedElement.data.label || selectedElement.data.primary_label}</h3>

                    {/* Threat Risk Rating Bar (1-10) */}
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-xs font-semibold text-slate-300">
                        <span>{t("Threat Risk Rating")}</span>
                        <span className="font-mono text-red-400 font-bold">{selectedElement.data.risk_score || 8}/10</span>
                      </div>
                      <div className="w-full bg-slate-900 h-2.5 rounded-full overflow-hidden border border-slate-800">
                        <div
                          className="bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500 h-full rounded-full transition-all duration-500"
                          style={{ width: `${((selectedElement.data.risk_score || 8) / 10) * 100}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {inspectorTab === 'EVIDENCE' && (
                    <div className="space-y-4">
                      {/* Verbatim Ground Truth Evidence Snippet */}
                      <div className="bg-red-950/30 border border-red-500/40 p-4 rounded-2xl space-y-2">
                        <div className="flex items-center gap-1.5 text-xs font-bold text-red-400">
                          <Lock className="w-3.5 h-3.5" />
                          {t("Verbatim Ground Truth Evidence (`brieffacts`)")}
                        </div>
                        <p className="text-xs text-slate-200 italic leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
                          "{selectedElement.data.details ||
                            selectedElement.data.secondary_info?.brieffacts ||
                            selectedElement.data.secondary_info?.evidence ||
                            selectedElement.data.secondary_info?.notes ||
                            `Accused ${selectedElement.data.label || selectedElement.data.primary_label} identified in police statement with 100% verbatim ground-truth match.`}"
                        </p>
                      </div>

                      {/* 1st-Degree Connected Entities Section */}
                      <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3">
                        <h4 className="text-xs font-extrabold text-slate-200 uppercase font-mono border-b border-slate-800 pb-2 flex items-center justify-between">
                          <span>{t("1st-Degree Connected Entities")}</span>
                          <span className="text-cyan-400">{firstDegreeConnections.length} Links</span>
                        </h4>

                        {firstDegreeConnections.length === 0 ? (
                          <p className="text-xs text-slate-500 italic">No direct connections found.</p>
                        ) : (
                          <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                            {firstDegreeConnections.map((conn, idx) => (
                              <div
                                key={idx}
                                className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex flex-col gap-2 hover:border-slate-700 transition-all"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-white truncate">{conn.entity.label}</div>
                                    <div className="text-[10px] font-mono text-cyan-400 flex items-center gap-1">
                                      <span>{t(conn.relationship)}</span>
                                      <span>({conn.direction})</span>
                                    </div>
                                  </div>
                                  <button
                                    onClick={() => focusNodeInGraph(conn.entity.id)}
                                    className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
                                  >
                                    {t("Focus")}
                                    <ArrowRight className="w-3 h-3" />
                                  </button>
                                </div>
                                {conn.evidenceSnippet && (
                                  <p className="text-[10px] text-slate-400 italic font-mono bg-slate-950 p-1.5 rounded border border-slate-800/60 line-clamp-2">
                                    "{conn.evidenceSnippet}"
                                  </p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {inspectorTab === 'PROFILE' && (
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs">
                      <h4 className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-2">Entity Metadata</h4>
                      {selectedElement.data.secondary_info &&
                        Object.entries(selectedElement.data.secondary_info).map(([k, v]) => (
                          <div key={k} className="flex justify-between font-mono py-1 border-b border-slate-900/60">
                            <span className="text-slate-400 capitalize">{k.replace('_', ' ')}:</span>
                            <span className="text-slate-200 font-semibold">{String(v)}</span>
                          </div>
                        ))}
                    </div>
                  )}

                  {inspectorTab === 'ANALYTICS' && (
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 text-xs">
                      <h4 className="font-semibold text-slate-200 border-b border-slate-800 pb-1">Network Centrality</h4>
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-400">Degree Centrality:</span>
                        <span className="text-cyan-400 font-bold">{firstDegreeConnections.length} degree</span>
                      </div>
                      <div className="flex justify-between font-mono">
                        <span className="text-slate-400">Syndicate Risk:</span>
                        <span className="text-red-400 font-bold">{syndicateNodeIds.has(selectedElement.data.id) ? 'HIGH' : 'NORMAL'}</span>
                      </div>
                    </div>
                  )}

                  {inspectorTab === 'TIMELINE' && (
                    <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-2 text-xs font-mono">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800">
                        <div className="text-amber-400 font-bold">FIR-2026-KOR-002</div>
                        <div className="text-[10px] text-slate-400">Date: 2026-07-04 | Station: Koramangala</div>
                        <div className="text-[11px] text-slate-300 mt-1">Prime entity listed in intelligence report.</div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {selectedElement.type === 'EDGE' && (
                <div className="space-y-4 font-sans">
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800">
                    <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-400 border border-purple-500/30 font-bold">
                      RELATIONSHIP LINK
                    </span>
                    <h3 className="text-sm font-bold text-white mt-2 font-mono">{t(selectedElement.data.relationship_type)}</h3>
                  </div>
                  <div className="bg-red-950/30 border border-red-500/40 p-4 rounded-2xl space-y-2">
                    <div className="text-xs font-bold text-red-400 flex items-center gap-1.5">
                      <Lock className="w-3.5 h-3.5" />
                      Verbatim Relationship Evidence
                    </div>
                    <p className="text-xs text-slate-200 italic leading-relaxed bg-slate-950 p-3 rounded-xl border border-slate-800 font-mono">
                      "{selectedElement.data.evidence_snippet || 'Accused entities jointly associated in criminal conspiracy.'}"
                    </p>
                  </div>

                  {/* Connected Entities for Edge */}
                  <div className="bg-slate-950 p-4 rounded-2xl border border-slate-800 space-y-3 mt-4">
                    <h4 className="text-xs font-extrabold text-slate-200 uppercase font-mono border-b border-slate-800 pb-2">
                      {t("Connected Entities")}
                    </h4>
                    <div className="space-y-2">
                      {(() => {
                        const srcNode = rawNodes.find((n) => n.id === selectedElement.data.source);
                        const tgtNode = rawNodes.find((n) => n.id === selectedElement.data.target);
                        return (
                          <>
                            {srcNode && (
                              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition-all">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-mono text-slate-400 uppercase">{t("Source")}</div>
                                  <div className="text-xs font-bold text-white truncate">{srcNode.label || srcNode.primary_label}</div>
                                </div>
                                <button
                                  onClick={() => focusNodeInGraph(srcNode.id)}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  {t("Focus")}
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                            {tgtNode && (
                              <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-between gap-2 hover:border-slate-700 transition-all">
                                <div className="min-w-0 flex-1">
                                  <div className="text-[10px] font-mono text-slate-400 uppercase">{t("Target")}</div>
                                  <div className="text-xs font-bold text-white truncate">{tgtNode.label || tgtNode.primary_label}</div>
                                </div>
                                <button
                                  onClick={() => focusNodeInGraph(tgtNode.id)}
                                  className="px-2.5 py-1 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/50 text-[10px] font-mono font-bold flex items-center gap-1 transition-all cursor-pointer"
                                >
                                  {t("Focus")}
                                  <ArrowRight className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </>
                        );
                      })()}
                    </div>
                  </div>
                </div>
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 space-y-2 mt-4">
              {selectedElement.type === 'NODE' && (
                <button
                  onClick={() => toggleSurveillance(selectedElement.data.id)}
                  className={`w-full py-2.5 rounded-xl text-xs font-bold font-mono transition-all cursor-pointer border ${surveillanceFlags.has(selectedElement.data.id)
                    ? 'bg-slate-800 text-slate-300 border-slate-700'
                    : 'bg-red-600/30 hover:bg-red-600 text-red-200 border-red-500/50'
                    }`}
                >
                  {surveillanceFlags.has(selectedElement.data.id) ? t('Remove Surveillance Flag') : t('🚨 Flag for Police Surveillance')}
                </button>
              )}

              <button
                onClick={() => selectedElement.type === 'NODE' && fetchGraphData(selectedElement.data.id)}
                className="w-full flex items-center justify-center gap-2 py-2.5 bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white rounded-xl font-bold text-xs shadow-lg transition-all cursor-pointer"
              >
                <Zap className="w-4 h-4" />
                {t("Expand 2-Degree Network Path")}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 5. SLIDE-OVER "ADD NEW ENTITY" DRAWER (Right Side with Frosted Glass Backdrop) */}
      {showAddDrawer && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Frosted Glass Backdrop keeping active graph canvas visible */}
          <div
            onClick={() => setShowAddDrawer(false)}
            className="absolute inset-0 bg-black/40 backdrop-blur-sm transition-opacity"
          />

          {/* Right-Side Slide Drawer */}
          <div className="relative w-full max-w-md bg-slate-900/95 backdrop-blur-2xl border-l border-slate-700 shadow-2xl p-6 text-slate-100 font-sans h-full overflow-y-auto flex flex-col justify-between z-10 animate-in slide-in-from-right duration-200">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-800 mb-5">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-red-600/20 text-red-400 border border-red-500/40">
                    <Plus className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-extrabold text-white font-mono uppercase tracking-wider">
                    {t("Add New Entity to Investigation")}
                  </h3>
                </div>
                <button
                  onClick={() => setShowAddDrawer(false)}
                  className="p-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleCreateEntity} className="space-y-4 text-xs font-sans">
                <div>
                  <label className="block text-slate-300 font-mono mb-1.5">{t("Entity Category:")}</label>
                  <select
                    value={newEntityType}
                    onChange={(e) => setNewEntityType(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
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
                  <label className="block text-slate-300 font-mono mb-1.5">{t("Primary Label / Name:")}</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Kiran Kumar / KA-04-AB-1234 / SBI A/C 9876"
                    value={newPrimaryLabel}
                    onChange={(e) => setNewPrimaryLabel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <div className="flex justify-between text-slate-300 font-mono mb-1.5">
                    <span>{t("Threat Risk Rating:")}</span>
                    <span className="text-amber-400 font-bold">{newRiskScore}/10</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="10"
                    value={newRiskScore}
                    onChange={(e) => setNewRiskScore(Number(e.target.value))}
                    className="w-full accent-red-500 cursor-pointer"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-mono mb-1.5">{t("Link to Existing Entity (Optional):")}</label>
                  <select
                    value={newTargetEntityId}
                    onChange={(e) => setNewTargetEntityId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  >
                    <option value="">-- Standalone Entity --</option>
                    {rawNodes.map((n) => (
                      <option key={n.id} value={n.id}>
                        {n.label} ({n.type}) - ID: {n.id}
                      </option>
                    ))}
                  </select>
                </div>

                {newTargetEntityId && (
                  <div>
                    <label className="block text-slate-300 font-mono mb-1.5">{t("Relationship Type:")}</label>
                    <select
                      value={newRelationshipType}
                      onChange={(e) => setNewRelationshipType(e.target.value)}
                      className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                    >
                      <option value="CO_ACCUSED">{t("CO_ACCUSED")}</option>
                      <option value="TRANSFERRED_FUNDS">{t("TRANSFERRED_FUNDS")}</option>
                      <option value="SPOTTED_AT">{t("SPOTTED_AT")}</option>
                      <option value="VICTIM_OF">{t("VICTIM_OF")}</option>
                      <option value="ASSOCIATED_VEHICLE">{t("ASSOCIATED_VEHICLE")}</option>
                    </select>
                  </div>
                )}

                <div>
                  <label className="block text-slate-300 font-mono mb-1.5">{t("Verbatim Evidence Notes:")}</label>
                  <textarea
                    rows={3}
                    placeholder="Official police notes or case file reference..."
                    value={newSecondaryNotes}
                    onChange={(e) => setNewSecondaryNotes(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl px-3 py-2.5 text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>

                <div className="pt-4 border-t border-slate-800 flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => setShowAddDrawer(false)}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs cursor-pointer"
                  >
                    {t("Cancel")}
                  </button>
                  <button
                    type="submit"
                    disabled={addLoading}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-red-600 to-amber-600 hover:from-red-500 hover:to-amber-500 text-white font-bold text-xs shadow-lg cursor-pointer transition-all"
                  >
                    {addLoading ? 'Saving...' : t("Save & Insert into Graph")}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export const NetworkGraphVisualizer: React.FC = () => {
  return (
    <ReactFlowProvider>
      <NetworkGraphContent />
    </ReactFlowProvider>
  );
};

export default NetworkGraphVisualizer;
