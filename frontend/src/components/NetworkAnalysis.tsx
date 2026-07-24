/**
 * @file NetworkAnalysis.tsx
 * @description State-of-the-Art Police Criminal Network Analysis & Visualizer.
 * 100% Real PostgreSQL Database Data.
 * Zero-Collision Network Layout Engine for Mode 1 & Mode 2.
 * Original Dark Navy Command Terminal Theme.
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

// Entity Color Palette & Configuration (Clean White & Navy Theme)
const ENTITY_CONFIG: Record<string, { bg: string; border: string; text: string; labelColor: string; icon: string }> = {
  ACCUSED: { bg: '#fef2f2', border: '#ef4444', text: '#991b1b', labelColor: '#7f1d1d', icon: '🔴' },
  SUSPECT: { bg: '#fef2f2', border: '#f87171', text: '#991b1b', labelColor: '#7f1d1d', icon: '🔴' },
  VICTIM: { bg: '#eff6ff', border: '#3b82f6', text: '#1e40af', labelColor: '#1e3a8a', icon: '🔵' },
  WITNESS: { bg: '#faf5ff', border: '#a855f7', text: '#6b21a8', labelColor: '#581c87', icon: '👤' },
  LOCATION: { bg: '#ecfdf5', border: '#10b981', text: '#065f46', labelColor: '#064e3b', icon: '🟢' },
  FINANCIAL_ACCOUNT: { bg: '#faf5ff', border: '#a855f7', text: '#6b21a8', labelColor: '#581c87', icon: '🟣' },
  VEHICLE: { bg: '#f0f9ff', border: '#38bdf8', text: '#075985', labelColor: '#0c4a6e', icon: '🚗' },
  WEAPON: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', labelColor: '#7c2d12', icon: '🗡️' },
  EVIDENCE: { bg: '#fff7ed', border: '#f97316', text: '#9a3412', labelColor: '#7c2d12', icon: '📦' },
  INCIDENT: { bg: '#fffbeb', border: '#f59e0b', text: '#92400e', labelColor: '#78350f', icon: '🟡' },
};

// Custom ReactFlow Entity Node Card
const CustomEntityNode: React.FC<NodeProps> = ({ data, selected }) => {
  const entityType = (data.type as string) || 'INCIDENT';
  const cfg = ENTITY_CONFIG[entityType] || ENTITY_CONFIG.INCIDENT;
  const riskScore = (data.risk_score as number) || 5;
  const isCentral = Boolean(data.is_central);

  const getRiskBadgeColor = (score: number) => {
    if (score >= 8) return { bg: '#fef2f2', text: '#dc2626', border: '#fca5a5' };
    if (score >= 5) return { bg: '#fffbeb', text: '#d97706', border: '#fde68a' };
    return { bg: '#ecfdf5', text: '#059669', border: '#a7f3d0' };
  };

  const riskStyle = getRiskBadgeColor(riskScore);

  return (
    <div
      style={{
        background: isCentral ? '#0b1e36' : cfg.bg,
        border: `2px solid ${selected ? '#c5a059' : isCentral ? '#c5a059' : cfg.border}`,
        borderRadius: isCentral ? '16px' : '12px',
        padding: isCentral ? '14px 18px' : '12px 14px',
        width: isCentral ? '280px' : '250px',
        boxShadow: selected
          ? '0 6px 22px rgba(197, 160, 89, 0.45)'
          : isCentral
          ? '0 6px 20px rgba(11, 30, 54, 0.25)'
          : '0 4px 14px rgba(11, 30, 54, 0.08)',
        cursor: 'pointer',
        color: isCentral ? '#ffffff' : cfg.labelColor,
        fontFamily: "'Outfit', sans-serif",
        transition: 'all 0.2s ease',
        transform: selected ? 'scale(1.03)' : 'none'
      }}
    >
      <Handle type="target" position={Position.Top} style={{ background: isCentral ? '#c5a059' : cfg.border, width: '10px', height: '10px' }} />

      {/* Header Badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ fontSize: isCentral ? '1.2rem' : '1rem' }}>{cfg.icon}</span>
          <span style={{ fontSize: '0.7rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.8px', color: isCentral ? '#ffe082' : cfg.text }}>
            {isCentral ? 'CENTRAL FIR NODE' : entityType.replace('_', ' ')}
          </span>
        </div>

        <span style={{
          background: riskStyle.bg,
          color: riskStyle.text,
          border: `1px solid ${riskStyle.border}`,
          fontSize: '0.68rem',
          fontWeight: 900,
          padding: '2px 6px',
          borderRadius: '4px'
        }}>
          RISK {riskScore}/10
        </span>
      </div>

      {/* Primary Label */}
      <div style={{ fontSize: isCentral ? '1.1rem' : '0.92rem', fontWeight: 900, color: isCentral ? '#ffffff' : '#0b1e36', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {String(data.label || '')}
      </div>

      {/* Cluster / Secondary note */}
      {Boolean(data.cluster_group) && (
        <div style={{ fontSize: '0.7rem', color: isCentral ? '#d8b4fe' : '#7c3aed', fontWeight: 700, marginBottom: '4px' }}>
          📍 {String(data.cluster_group || '')}
        </div>
      )}

      {/* ID Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.72rem', color: isCentral ? '#cbd5e1' : '#64748b', fontFamily: 'monospace' }}>
        <span>ID: {String(data.id || '')}</span>
        {riskScore >= 8 && (
          <span style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fca5a5', padding: '1px 5px', borderRadius: '3px', fontSize: '0.66rem', fontWeight: 800 }}>
            FLAGGED
          </span>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} style={{ background: isCentral ? '#c5a059' : cfg.border, width: '10px', height: '10px' }} />
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

  const isCoAccused = label === 'CO_ACCUSED' || label === 'CO_ACCUSED_GANG' || label === 'SHARED_ACCOMPLICE';
  const isSimilarArea = label === 'SAME_MO_&_AREA';
  const isVictim = label === 'VICTIM_OF' || label === 'FILED_COMPLAINT';
  const isWitness = label === 'WITNESSED';
  const isVehicle = label === 'USED_VEHICLE' || label === 'GETAWAY_VEHICLE';
  const isWeapon = label === 'WEAPON_USED' || label === 'EVIDENCE_IN';

  const strokeColor = selected
    ? '#ffe082'
    : isCoAccused
    ? '#ef4444'
    : isSimilarArea
    ? '#a855f7'
    : isVictim
    ? '#3b82f6'
    : isWitness
    ? '#c084fc'
    : isVehicle
    ? '#38bdf8'
    : isWeapon
    ? '#f97316'
    : '#475569';

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 3.5 : isCoAccused || isSimilarArea ? 2.5 : 2}
        strokeDasharray={isSimilarArea ? '6 4' : isCoAccused ? '4 2' : 'none'}
      />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              background: '#040a14',
              color: selected ? '#ffe082' : strokeColor,
              border: `1px solid ${selected ? '#ffe082' : strokeColor}`,
              padding: '2px 7px',
              borderRadius: '4px',
              fontSize: '0.7rem',
              fontWeight: 900,
              pointerEvents: 'all',
              boxShadow: '0 2px 8px rgba(0,0,0,0.7)',
              letterSpacing: '0.3px',
              whiteSpace: 'nowrap'
            }}
          >
            [{label}]
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

  // Mode 1 Case Selection
  const [availableCases, setAvailableCases] = useState<any[]>([]);
  const [selectedCaseId, setSelectedCaseId] = useState<string>('');

  // Mode 2 Cluster Filters
  const [moFilter, setMoFilter] = useState<string>('ALL');
  const [areaFilter, setAreaFilter] = useState<string>('ALL');

  // Add Entity Form State
  const [newType, setNewType] = useState<string>('ACCUSED');
  const [newLabel, setNewLabel] = useState<string>('');
  const [newRisk, setNewRisk] = useState<number>(7);
  const [newTargetId, setNewTargetId] = useState<string>('');
  const [newRelType, setNewRelType] = useState<string>('CO_ACCUSED');
  const [newNotes, setNewNotes] = useState<string>('');

  // Telemetry state
  const [telemetry, setTelemetry] = useState<any>(null);

  // Fetch available cases for Mode 1 dropdown
  const fetchCasesList = async () => {
    try {
      const res = await fetch('/api/network-graph/cases-list', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.cases) {
          setAvailableCases(data.cases);
          if (data.cases.length > 0 && !selectedCaseId) {
            setSelectedCaseId(data.cases[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch cases list:', err);
    }
  };

  useEffect(() => {
    fetchCasesList();
  }, []);

  const fetchGraphData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.append('mode', networkMode);

      if (networkMode === 'case') {
        if (selectedCaseId) params.append('case_id', selectedCaseId);
        if (searchQuery) params.append('query', searchQuery);
      } else {
        if (searchQuery) params.append('query', searchQuery);
        if (moFilter !== 'ALL') params.append('mo', moFilter);
        if (areaFilter !== 'ALL') params.append('area', areaFilter);
      }

      const url = `/api/network-graph?${params.toString()}`;
      const res = await fetch(url, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        if (data.nodes && data.edges) {
          setTelemetry(data.telemetry);

          const rawNodes = data.nodes;
          let positionedNodes: any[] = [];

          if (networkMode === 'case') {
            const centralNode = rawNodes.find((n: any) => n.is_central || n.type === 'INCIDENT') || rawNodes[0];
            const otherNodes = rawNodes.filter((n: any) => n.id !== centralNode?.id);

            const cx = 650;
            const cy = 420;

            const accusedNodes = otherNodes.filter((n: any) => n.type === 'ACCUSED' || n.type === 'SUSPECT');
            const victimNodes = otherNodes.filter((n: any) => n.type === 'VICTIM');
            const witnessNodes = otherNodes.filter((n: any) => n.type === 'WITNESS');
            const evidenceNodes = otherNodes.filter((n: any) => n.type === 'VEHICLE' || n.type === 'WEAPON' || n.type === 'EVIDENCE' || n.type === 'FINANCIAL_ACCOUNT');
            const locationNodes = otherNodes.filter((n: any) => n.type === 'LOCATION');
            const remainingNodes = otherNodes.filter((n: any) => 
              !accusedNodes.includes(n) && 
              !victimNodes.includes(n) && 
              !witnessNodes.includes(n) && 
              !evidenceNodes.includes(n) && 
              !locationNodes.includes(n)
            );

            // 1. Central FIR Node
            positionedNodes.push({
              id: centralNode.id,
              type: 'customEntity',
              position: { x: cx, y: cy },
              data: { ...centralNode, is_central: true }
            });

            // 2. Accused & Suspects Layer (Top Row at Y = 100)
            const accCount = accusedNodes.length;
            accusedNodes.forEach((n: any, idx: number) => {
              const x = cx + (idx - (accCount - 1) / 2) * 360;
              const y = 100;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x: Math.round(x), y: Math.round(y) }, data: n });
            });

            // 3. Victims & Complainants Layer (Right Column at X = 1150)
            const vicCount = victimNodes.length;
            victimNodes.forEach((n: any, idx: number) => {
              const x = 1150;
              const y = cy + (idx - (vicCount - 1) / 2) * 210;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x: Math.round(x), y: Math.round(y) }, data: n });
            });

            // 4. Witnesses Layer (Left Column at X = 150)
            const witCount = witnessNodes.length;
            witnessNodes.forEach((n: any, idx: number) => {
              const x = 150;
              const y = cy + (idx - (witCount - 1) / 2) * 210;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x: Math.round(x), y: Math.round(y) }, data: n });
            });

            // 5. Vehicles, Weapons & Evidence Layer (Bottom Row at Y = 740)
            const evdCount = evidenceNodes.length;
            evidenceNodes.forEach((n: any, idx: number) => {
              const x = cx + (idx - (evdCount - 1) / 2) * 360;
              const y = 740;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x: Math.round(x), y: Math.round(y) }, data: n });
            });

            // 6. Locations Layer (Top Corners)
            locationNodes.forEach((n: any, idx: number) => {
              const x = idx % 2 === 0 ? 150 : 1150;
              const y = 80;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x, y }, data: n });
            });

            // Remaining Nodes
            remainingNodes.forEach((n: any, idx: number) => {
              const x = cx + (idx - (remainingNodes.length - 1) / 2) * 360;
              const y = 920;
              positionedNodes.push({ id: n.id, type: 'customEntity', position: { x: Math.round(x), y: Math.round(y) }, data: n });
            });

          } else {
            const clustersMap: Record<string, any[]> = {};
            for (const n of rawNodes) {
              const key = n.cluster_group || 'General Syndicate';
              if (!clustersMap[key]) clustersMap[key] = [];
              clustersMap[key].push(n);
            }

            const clusterKeys = Object.keys(clustersMap);

            clusterKeys.forEach((key: string, cIdx: number) => {
              const clusterCx = (cIdx % 2) * 850 + 250;
              const clusterCy = Math.floor(cIdx / 2) * 550 + 150;
              const clusterNodes = clustersMap[key];

              clusterNodes.forEach((n: any, nIdx: number) => {
                const col = nIdx % 2;
                const row = Math.floor(nIdx / 2);
                const nx = clusterCx + (col - 0.5) * 360;
                const ny = clusterCy + row * 200;

                positionedNodes.push({
                  id: n.id,
                  type: 'customEntity',
                  position: { x: Math.round(nx), y: Math.round(ny) },
                  data: n
                });
              });
            });
          }

          const formattedEdges = data.edges.map((e: any) => ({
            id: e.id,
            source: e.source,
            target: e.target,
            type: 'customEdge',
            label: e.label,
            data: { evidence: e.evidence }
          }));

          setNodes(positionedNodes);
          setEdges(formattedEdges);
        }
      }
    } catch (err) {
      console.error('Failed to fetch network graph:', err);
    } finally {
      setLoading(false);
    }
  }, [networkMode, selectedCaseId, searchQuery, moFilter, areaFilter]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchGraphData();
    }, 250);
    return () => clearTimeout(timer);
  }, [fetchGraphData]);

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
        fetchGraphData();
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
    <div style={{ padding: '1.25rem', maxWidth: '1700px', margin: '0 auto', fontFamily: "'Outfit', sans-serif" }}>
      {/* TOP HERO HEADER */}
      <div style={{
        background: '#ffffff',
        border: '1px solid #e2e8f0',
        borderRadius: '14px',
        padding: '1.25rem 1.5rem',
        marginBottom: '1rem',
        boxShadow: '0 4px 14px rgba(11, 30, 54, 0.05)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
              <span style={{ background: '#fdfaf2', color: '#a4823f', border: '1px solid rgba(197, 160, 89, 0.4)', padding: '0.2rem 0.65rem', borderRadius: '20px', fontSize: '0.72rem', fontWeight: 800 }}>
                KSP INTELLIGENCE COMMAND
              </span>
              <span style={{
                background: networkMode === 'case' ? '#ecfdf5' : '#faf5ff',
                color: networkMode === 'case' ? '#047857' : '#6b21a8',
                border: `1px solid ${networkMode === 'case' ? '#a7f3d0' : '#e9d5ff'}`,
                padding: '0.2rem 0.6rem',
                borderRadius: '20px',
                fontSize: '0.72rem',
                fontWeight: 800
              }}>
                {networkMode === 'case' ? 'MODE 1: CASE-SPECIFIC DEEP DIVE' : 'MODE 2: ORGANIZED CRIME PATTERN FINDER'}
              </span>
            </div>
            <h2 style={{ margin: 0, color: '#0b1e36', fontSize: '1.5rem', fontWeight: 900, letterSpacing: '-0.3px', display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
              <span>{networkMode === 'case' ? '📂' : '🕸️'}</span>
              {t("Tactical Criminal Network & Relationship Analysis")}
            </h2>
          </div>

          <button
            onClick={() => setShowAddDrawer(true)}
            style={{
              background: 'linear-gradient(135deg, #0b1e36 0%, #152c4b 100%)',
              color: '#c5a059',
              border: '1px solid #c5a059',
              padding: '0.65rem 1.2rem',
              borderRadius: '8px',
              fontWeight: 900,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 4px 14px rgba(11, 30, 54, 0.15)'
            }}
          >
            <span>➕</span> {t("Add New Entity to Graph")}
          </button>
        </div>

        {/* MODE TOGGLE SWITCHER */}
        <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem', flexWrap: 'wrap' }}>
          <button
            onClick={() => setNetworkMode('case')}
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.8rem 1.1rem',
              borderRadius: '12px',
              border: networkMode === 'case' ? '2px solid #0b1e36' : '1px solid #e2e8f0',
              background: networkMode === 'case' ? '#f0f7ff' : '#ffffff',
              color: networkMode === 'case' ? '#0b1e36' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              boxShadow: networkMode === 'case' ? '0 4px 14px rgba(11, 30, 54, 0.08)' : 'none',
              transition: 'all 0.25s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: networkMode === 'case' ? '#0b1e36' : '#f1f5f9',
              color: networkMode === 'case' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              fontWeight: 900
            }}>
              📂
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0b1e36' }}>
                Mode 1: Case-Specific Network (Deep Dive)
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
                Centralized FIR diagram with Accused, Victims, Witnesses &amp; Vehicles
              </div>
            </div>
          </button>

          <button
            onClick={() => setNetworkMode('gang')}
            style={{
              flex: 1,
              minWidth: '260px',
              padding: '0.8rem 1.1rem',
              borderRadius: '12px',
              border: networkMode === 'gang' ? '2px solid #6b21a8' : '1px solid #e2e8f0',
              background: networkMode === 'gang' ? '#faf5ff' : '#ffffff',
              color: networkMode === 'gang' ? '#581c87' : '#64748b',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.85rem',
              boxShadow: networkMode === 'gang' ? '0 4px 14px rgba(107, 33, 168, 0.12)' : 'none',
              transition: 'all 0.25s ease',
              textAlign: 'left'
            }}
          >
            <div style={{
              width: '40px',
              height: '40px',
              borderRadius: '10px',
              background: networkMode === 'gang' ? '#6b21a8' : '#f1f5f9',
              color: networkMode === 'gang' ? '#ffffff' : '#64748b',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.3rem',
              fontWeight: 900
            }}>
              🕸️
            </div>
            <div>
              <div style={{ fontSize: '0.95rem', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px', color: '#0b1e36' }}>
                Mode 2: Organized Crime Network (Pattern Finder)
              </div>
              <div style={{ fontSize: '0.76rem', color: '#475569', fontWeight: 600, marginTop: '2px' }}>
                Clusters criminals by Similar MO, Area Proximity &amp; Shared Accomplices
              </div>
            </div>
          </button>
        </div>

        {/* 5 STAT METRIC PILLS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '0.85rem', marginTop: '1rem' }}>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#a4823f', fontWeight: 800, textTransform: 'uppercase' }}>Network Nodes</div>
            <div style={{ fontSize: '1.3rem', color: '#0b1e36', fontWeight: 900 }}>{nodes.length}</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#0284c7', fontWeight: 800, textTransform: 'uppercase' }}>Active Relational Edges</div>
            <div style={{ fontSize: '1.3rem', color: '#0b1e36', fontWeight: 900 }}>{edges.length}</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#dc2626', fontWeight: 800, textTransform: 'uppercase' }}>High Risk Suspects</div>
            <div style={{ fontSize: '1.3rem', color: '#dc2626', fontWeight: 900 }}>{totalHighRisk}</div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#7c3aed', fontWeight: 800, textTransform: 'uppercase' }}>
              {networkMode === 'gang' ? 'Syndicate Clusters' : 'Connected Entities'}
            </div>
            <div style={{ fontSize: '1.3rem', color: '#6b21a8', fontWeight: 900 }}>
              {telemetry?.clusters_count || telemetry?.accused_count || nodes.length}
            </div>
          </div>
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '0.65rem 0.85rem' }}>
            <div style={{ fontSize: '0.7rem', color: '#059669', fontWeight: 800, textTransform: 'uppercase' }}>Active Mode</div>
            <div style={{ fontSize: '1rem', color: '#0b1e36', fontWeight: 900 }}>
              {networkMode === 'case' ? 'Deep Dive Topology' : 'Pattern Finder Cluster'}
            </div>
          </div>
        </div>

        {/* STRUCTURED ZERO-OVERLAP CONTROL PANEL */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '10px',
          padding: '1rem',
          marginTop: '1.25rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem'
        }}>
          {networkMode === 'case' ? (
            /* MODE 1 CASE SELECTOR ROW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
              <label style={{ color: '#0b1e36', fontWeight: 900, fontSize: '0.82rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                🔍 Select Specific FIR / Case for Deep Dive Topology:
              </label>
              <select
                value={selectedCaseId}
                onChange={(e) => setSelectedCaseId(e.target.value)}
                style={{
                  width: '100%',
                  background: '#f8fafc',
                  border: '2px solid #0b1e36',
                  color: '#0b1e36',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  outline: 'none',
                  fontSize: '0.92rem',
                  fontWeight: 800
                }}
              >
                {availableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    FIR #{c.case_number} - {c.station_name} ({c.category}) — {c.title}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            /* MODE 2 MO AND AREA FILTERS ROW */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#6b21a8', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Filter Modus Operandi (MO):
                </label>
                <select
                  value={moFilter}
                  onChange={(e) => setMoFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    border: '1px solid #6b21a8',
                    color: '#581c87',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '8px',
                    outline: 'none',
                    fontWeight: 800,
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="ALL">All Crime Types (MO)</option>
                  <option value="burglary">Burglary &amp; Safe Heist</option>
                  <option value="robbery">Armed Robbery &amp; Jewelry</option>
                  <option value="cyber">Cyber Crime &amp; Extortion</option>
                  <option value="property">Crimes Against Property</option>
                </select>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                <label style={{ color: '#6b21a8', fontWeight: 900, fontSize: '0.8rem', textTransform: 'uppercase' }}>
                  Filter Station / Area:
                </label>
                <select
                  value={areaFilter}
                  onChange={(e) => setAreaFilter(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#f8fafc',
                    border: '1px solid #6b21a8',
                    color: '#581c87',
                    padding: '0.7rem 0.9rem',
                    borderRadius: '8px',
                    outline: 'none',
                    fontWeight: 800,
                    fontSize: '0.88rem'
                  }}
                >
                  <option value="ALL">All Police Station Areas</option>
                  <option value="koramangala">Koramangala</option>
                  <option value="indiranagar">Indiranagar</option>
                  <option value="whitefield">Whitefield</option>
                  <option value="jayanagar">Jayanagar</option>
                  <option value="malleshwaram">Malleshwaram</option>
                  <option value="peenya">Peenya</option>
                </select>
              </div>
            </div>
          )}

          {/* ROW 2: SEARCH INPUT AND ENTITY CATEGORY FILTER */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: '1rem' }}>
            <div style={{ position: 'relative' }}>
              <input
                type="text"
                placeholder={networkMode === 'case'
                  ? t("Search suspect, witness, vehicle, or FIR number...")
                  : t("Search criminal gang suspect name or alias...")}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  background: '#f8fafc',
                  border: '1px solid #cbd5e1',
                  color: '#0b1e36',
                  padding: '0.7rem 2.5rem 0.7rem 1rem',
                  borderRadius: '8px',
                  outline: 'none',
                  fontSize: '0.9rem',
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
                    color: '#64748b',
                    fontSize: '1rem',
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
                width: '100%',
                background: '#f8fafc',
                border: '1px solid #cbd5e1',
                color: '#0b1e36',
                padding: '0.7rem 0.9rem',
                borderRadius: '8px',
                outline: 'none',
                fontWeight: 700,
                fontSize: '0.88rem'
              }}
            >
              <option value="ALL">All Entity Types</option>
              <option value="ACCUSED">🔴 Accused &amp; Suspects</option>
              <option value="VICTIM">🔵 Victims</option>
              <option value="WITNESS">👤 Witnesses</option>
              <option value="VEHICLE">🚗 Vehicles</option>
              <option value="WEAPON">🗡️ Weapons &amp; Evidence</option>
              <option value="LOCATION">🟢 Locations</option>
              <option value="INCIDENT">🟡 FIR Incidents</option>
            </select>
          </div>
        </div>
      </div>

      {/* GRAPH CANVAS & INSPECTOR SPLIT VIEW */}
      <div style={{ display: 'flex', gap: '1.25rem', height: 'calc(100vh - 220px)', minHeight: '740px', position: 'relative' }}>

        {/* MAIN REACTFLOW GRAPH CANVAS */}
        <div style={{
          flex: 1,
          background: '#ffffff',
          border: '1px solid #cbd5e1',
          borderRadius: '14px',
          overflow: 'hidden',
          position: 'relative'
        }}>
          {/* Subtle Concentric Radar Rings */}
          <div style={{
            position: 'absolute',
            left: '50%',
            top: '50%',
            transform: 'translate(-50%, -50%)',
            pointerEvents: 'none',
            width: '1100px',
            height: '1100px',
            borderRadius: '50%',
            background: 'radial-gradient(circle at center, rgba(11, 30, 54, 0.05) 0%, rgba(197, 160, 89, 0.02) 35%, transparent 70%)',
            border: '1px dashed rgba(11, 30, 54, 0.1)',
            zIndex: 0
          }}>
            <div style={{
              position: 'absolute',
              left: '50%',
              top: '50%',
              transform: 'translate(-50%, -50%)',
              width: '650px',
              height: '650px',
              borderRadius: '50%',
              background: 'radial-gradient(circle at center, rgba(2, 132, 199, 0.04) 0%, transparent 60%)',
              border: '1px dashed rgba(2, 132, 199, 0.12)',
            }} />
          </div>

          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#0b1e36', flexDirection: 'column', gap: '1rem' }}>
              <div className="spinner" style={{ width: '36px', height: '36px', border: '3px solid #0b1e36', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 1s linear infinite' }}></div>
              <strong style={{ fontSize: '1.05rem' }}>
                {networkMode === 'case' ? 'Generating Centralized Case-Specific Deep Dive Diagram...' : 'Clustering Organized Crime Syndicates across Database Records...'}
              </strong>
            </div>
          ) : displayedNodes.length === 0 ? (
            <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', color: '#64748b', flexDirection: 'column', gap: '0.5rem' }}>
              <span style={{ fontSize: '2rem' }}>🔍</span>
              <strong style={{ fontSize: '1.1rem', color: '#0b1e36' }}>No Network Entities Found</strong>
              <span style={{ fontSize: '0.85rem' }}>Try clearing filters or selecting another case from the dropdown.</span>
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
              fitViewOptions={{ padding: 0.25, includeHiddenNodes: false }}
              minZoom={0.25}
              maxZoom={1.5}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1.5} color="#cbd5e1" />
              <Controls style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', fill: '#0b1e36' }} />
              <MiniMap style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px' }} nodeColor="#0b1e36" maskColor="rgba(248, 250, 252, 0.8)" />
            </ReactFlow>
          )}
        </div>

        {/* RIGHT SIDE ENTITY INSPECTOR PANEL */}
        {selectedEntity && (
          <div style={{
            width: '360px',
            background: '#ffffff',
            border: '1px solid #cbd5e1',
            borderRadius: '14px',
            padding: '1.25rem',
            overflowY: 'auto',
            boxShadow: '0 4px 18px rgba(11, 30, 54, 0.1)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e2e8f0', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <strong style={{ color: '#0b1e36', fontSize: '1.1rem' }}>Entity Inspector</strong>
              <button
                onClick={() => setSelectedEntity(null)}
                style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <span style={{ fontSize: '0.75rem', color: '#a4823f', fontWeight: 800, textTransform: 'uppercase' }}>
                {selectedEntity.type}
              </span>
              <h3 style={{ margin: '0.2rem 0', color: '#0b1e36', fontSize: '1.3rem', fontWeight: 900 }}>
                {selectedEntity.label}
              </h3>
              <span style={{ fontSize: '0.8rem', color: '#64748b', fontFamily: 'monospace' }}>ID: {selectedEntity.id}</span>
            </div>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
              <div style={{ fontSize: '0.75rem', color: '#64748b', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.35rem' }}>Threat Risk Rating</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                  <div style={{ width: `${(selectedEntity.risk_score || 5) * 10}%`, height: '100%', background: (selectedEntity.risk_score || 5) >= 8 ? '#dc2626' : '#d97706' }}></div>
                </div>
                <strong style={{ color: (selectedEntity.risk_score || 5) >= 8 ? '#dc2626' : '#d97706', fontSize: '1.1rem' }}>
                  {selectedEntity.risk_score}/10
                </strong>
              </div>
            </div>

            {selectedEntity.secondary_info && (
              <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.85rem', borderRadius: '8px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '0.75rem', color: '#a4823f', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Metadata &amp; Intelligence Notes</div>
                <pre style={{ margin: 0, color: '#334155', fontSize: '0.82rem', whiteSpace: 'pre-wrap', fontFamily: 'monospace' }}>
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
          background: 'rgba(11, 30, 54, 0.4)',
          backdropFilter: 'blur(4px)',
          zIndex: 1000,
          display: 'flex',
          justifyContent: 'flex-end'
        }}>
          <div style={{
            width: '420px',
            height: '100%',
            background: '#ffffff',
            borderLeft: '1px solid #cbd5e1',
            padding: '1.75rem',
            overflowY: 'auto',
            boxShadow: '-10px 0 30px rgba(11, 30, 54, 0.15)',
            color: '#0b1e36'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', borderBottom: '1px solid #e2e8f0', paddingBottom: '1rem' }}>
              <h3 style={{ margin: 0, color: '#0b1e36', fontSize: '1.2rem', fontWeight: 800 }}>➕ Add New Entity to Investigation</h3>
              <button onClick={() => setShowAddDrawer(false)} style={{ background: 'none', border: 'none', color: '#64748b', fontSize: '1.4rem', cursor: 'pointer' }}>✕</button>
            </div>

            <form onSubmit={handleCreateEntity} style={{ display: 'flex', flexDirection: 'column', gap: '1.1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Entity Category:</label>
                <select
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                  style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0b1e36', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                >
                  <option value="ACCUSED">🔴 ACCUSED / SUSPECT</option>
                  <option value="VICTIM">🔵 VICTIM</option>
                  <option value="WITNESS">👤 WITNESS</option>
                  <option value="LOCATION">🟢 LOCATION / HOTSPOT</option>
                  <option value="FINANCIAL_ACCOUNT">🟣 FINANCIAL ACCOUNT / PHONE</option>
                  <option value="VEHICLE">🚗 VEHICLE</option>
                  <option value="WEAPON">🗡️ WEAPON / EVIDENCE</option>
                  <option value="INCIDENT">🟡 CASE INCIDENT (FIR)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Primary Label / Name:</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Kiran Kumar / KA-04-AB-1234 / Oxy-Acetylene Torch"
                  value={newLabel}
                  onChange={(e) => setNewLabel(e.target.value)}
                  style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0b1e36', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, marginBottom: '0.4rem' }}>
                  <span>Threat Risk Rating:</span>
                  <span style={{ color: '#d97706' }}>{newRisk}/10</span>
                </div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={newRisk}
                  onChange={(e) => setNewRisk(Number(e.target.value))}
                  style={{ width: '100%', accentColor: '#0b1e36' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Link to Existing Entity (Optional):</label>
                <select
                  value={newTargetId}
                  onChange={(e) => setNewTargetId(e.target.value)}
                  style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0b1e36', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
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
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Relationship Type:</label>
                  <select
                    value={newRelType}
                    onChange={(e) => setNewRelType(e.target.value)}
                    style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0b1e36', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none' }}
                  >
                    <option value="ACCUSED_IN">ACCUSED_IN</option>
                    <option value="SUSPECT_IN">SUSPECT_IN</option>
                    <option value="VICTIM_OF">VICTIM_OF</option>
                    <option value="WITNESSED">WITNESSED</option>
                    <option value="USED_VEHICLE">USED_VEHICLE</option>
                    <option value="WEAPON_USED">WEAPON_USED</option>
                    <option value="CO_ACCUSED">CO_ACCUSED</option>
                  </select>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#0b1e36', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem' }}>Verbatim Evidence Notes:</label>
                <textarea
                  rows={3}
                  placeholder="Official police notes or case file reference..."
                  value={newNotes}
                  onChange={(e) => setNewNotes(e.target.value)}
                  style={{ width: '100%', background: '#f8fafc', border: '1px solid #cbd5e1', color: '#0b1e36', padding: '0.75rem', borderRadius: '8px', fontSize: '0.9rem', outline: 'none', fontFamily: 'monospace' }}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button
                  type="submit"
                  style={{ flex: 1, background: 'linear-gradient(135deg, #0b1e36 0%, #152c4b 100%)', color: '#c5a059', border: '1px solid #c5a059', padding: '0.75rem', borderRadius: '8px', fontWeight: 800, cursor: 'pointer' }}
                >
                  Create Entity Node
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddDrawer(false)}
                  style={{ background: '#f1f5f9', color: '#64748b', border: '1px solid #cbd5e1', padding: '0.75rem 1rem', borderRadius: '8px', fontWeight: 700, cursor: 'pointer' }}
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
