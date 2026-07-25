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
import { DbAutocompleteInput } from './DbAutocompleteInput';

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
        borderRadius: isCentral ? '12px' : '8px',
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

  const isCoAccused = label === 'CO_ACCUSED' || label === 'CO_ACCUSED_GANG';
  const isSharedAccomplice = label === 'SHARED_ACCOMPLICE';
  const isSharedMoSpot = label === 'SHARED_MO_SPOT' || label === 'SAME_MO_&_AREA';
  const isVictim = label === 'VICTIM_OF' || label === 'FILED_COMPLAINT';
  const isWitness = label === 'WITNESSED';
  const isVehicle = label === 'USED_VEHICLE' || label === 'GETAWAY_VEHICLE' || label === 'SHARED_ASSET';
  const isWeapon = label === 'WEAPON_USED' || label === 'EVIDENCE_IN';

  const strokeColor = selected
    ? '#ffe082'
    : isCoAccused
    ? '#dc2626'
    : isSharedAccomplice
    ? '#ea580c'
    : isSharedMoSpot
    ? '#7c3aed'
    : isVictim
    ? '#2563eb'
    : isWitness
    ? '#9333ea'
    : isVehicle
    ? '#0284c7'
    : isWeapon
    ? '#d97706'
    : '#475569';

  return (
    <>
      <path
        id={id}
        d={edgePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth={selected ? 3.5 : isCoAccused || isSharedAccomplice ? 2.5 : 2}
        strokeDasharray={isSharedMoSpot ? '6 4' : isCoAccused ? 'none' : '4 2'}
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
  const [selectedCaseId, setSelectedCaseId] = useState<string>('NONE');



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
        if (selectedCaseId && selectedCaseId !== 'NONE') params.append('case_id', selectedCaseId);
        if (searchQuery) params.append('query', searchQuery);

        // If 'NONE' is selected and user hasn't typed a search query yet, render empty canvas
        if ((!selectedCaseId || selectedCaseId === 'NONE') && !searchQuery.trim()) {
          setNodes([]);
          setEdges([]);
          setLoading(false);
          setTelemetry({ total_nodes: 0, total_edges: 0 });
          return;
        }
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
        borderRadius: '12px',
        padding: '1rem 1.25rem',
        marginBottom: '1rem',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div>
            <h2 style={{ margin: 0, color: '#0b1e36', fontSize: '1.35rem', fontWeight: 800, letterSpacing: '-0.3px' }}>
              {t("Tactical Criminal Network & Relationship Analysis")}
            </h2>
          </div>

          {/* Mode Switcher Tabs + Add Entity Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '8px', border: '1px solid #cbd5e1' }}>
              <button
                onClick={() => setNetworkMode('case')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: networkMode === 'case' ? '#0b1e36' : 'transparent',
                  color: networkMode === 'case' ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                📂 Mode 1: Case Deep Dive
              </button>
              <button
                onClick={() => setNetworkMode('gang')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: 'none',
                  background: networkMode === 'gang' ? '#0b1e36' : 'transparent',
                  color: networkMode === 'gang' ? '#ffffff' : '#475569',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease'
                }}
              >
                🕸️ Mode 2: Organized Crime Network
              </button>
            </div>

            <button
              onClick={() => setShowAddDrawer(true)}
              style={{
                background: '#0b1e36',
                color: '#ffffff',
                border: 'none',
                padding: '6px 14px',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '0.82rem',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              <span>+</span> {t("Add Entity")}
            </button>
          </div>
        </div>

        {/* STRUCTURED ZERO-OVERLAP CONTROL PANEL */}
        <div style={{
          background: '#ffffff',
          border: '1px solid #e2e8f0',
          borderRadius: '8px',
          padding: '0.85rem 1rem',
          marginTop: '0.85rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem'
        }}>
          {networkMode === 'case' ? (
            /* MODE 1 CASE SELECTOR ROW */
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>
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
                <option value="NONE">
                  🚫 None (Search Only Mode — Show Only Searched Entities & Criminals)
                </option>
                {availableCases.map((c) => (
                  <option key={c.id} value={c.id}>
                    FIR #{c.case_number} - {c.station_name || c.police_station} ({c.category}) — {c.title}
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
                  <option value="doddapete">Doddapete PS</option>
                  <option value="shivamogga">Shivamogga Station</option>
                  <option value="shimoga">Shimoga Sub-Division</option>
                  <option value="bangalore">Bangalore City HQ</option>
                </select>
              </div>
            </div>
          )}

          {/* ROW 2: SEARCH INPUT AND ENTITY CATEGORY FILTER */}
          <div style={{ display: 'grid', gridTemplateColumns: networkMode === 'case' ? '1fr 240px' : '1fr', gap: '1rem' }}>
            <DbAutocompleteInput
              placeholder={networkMode === 'case'
                ? t("Search suspect, witness, vehicle, or FIR number...")
                : t("Search criminal gang suspect name or alias...")}
              value={searchQuery}
              onChange={(val) => setSearchQuery(val)}
              onSearch={() => fetchGraphData()}
              onSelectSuggestion={(item) => {
                if (item.value) {
                  setSearchQuery(item.value);
                  setTimeout(() => fetchGraphData(), 50);
                }
              }}
            />

            {/* Category Filter dropdown is displayed in Mode 1 where multiple entity types exist */}
            {networkMode === 'case' && (
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
            )}
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

          {/* RIGHT SIDE ENTITY INSPECTOR PANEL */}
          {selectedEntity && (
            <div style={{
              position: 'absolute',
              top: '20px',
              right: '20px',
              width: '380px',
              maxHeight: 'calc(100% - 40px)',
              background: '#ffffff',
              border: '1.5px solid #0b1e36',
              borderRadius: '10px',
              padding: '0',
              overflowY: 'auto',
              boxShadow: '0 12px 32px rgba(11, 30, 54, 0.25)',
              color: '#0b1e36',
              zIndex: 10
            }}>
              {/* HERO POLICE COMMAND HEADER */}
              <div style={{
                background: 'linear-gradient(135deg, #070f19 0%, #0b1e36 100%)',
                padding: '1.25rem 1.4rem',
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
                borderBottom: '2px solid #c5a059',
                color: '#ffffff',
                position: 'relative'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <span style={{
                    background: selectedEntity.type === 'ACCUSED' ? 'rgba(239, 68, 68, 0.25)' : selectedEntity.type === 'INCIDENT' ? 'rgba(245, 158, 11, 0.25)' : 'rgba(59, 130, 246, 0.25)',
                    color: selectedEntity.type === 'ACCUSED' ? '#f87171' : selectedEntity.type === 'INCIDENT' ? '#fbbf24' : '#60a5fa',
                    border: `1px solid ${selectedEntity.type === 'ACCUSED' ? '#ef4444' : selectedEntity.type === 'INCIDENT' ? '#f59e0b' : '#3b82f6'}`,
                    padding: '0.2rem 0.65rem',
                    borderRadius: '4px',
                    fontSize: '0.72rem',
                    fontWeight: 800,
                    letterSpacing: '0.5px'
                  }}>
                    {selectedEntity.type === 'ACCUSED' ? '🔴 SUSPECT / ACCUSED' : selectedEntity.type === 'INCIDENT' ? '🟡 CRIME INCIDENT (FIR)' : `🔵 ${selectedEntity.type}`}
                  </span>

                  <button
                    onClick={() => setSelectedEntity(null)}
                    style={{
                      background: 'rgba(255, 255, 255, 0.1)',
                      border: 'none',
                      color: '#94a3b8',
                      width: '26px',
                      height: '26px',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      cursor: 'pointer',
                      fontSize: '1rem',
                      fontWeight: 700
                    }}
                  >
                    ✕
                  </button>
                </div>

                <h3 style={{ margin: '0.3rem 0 0.1rem 0', color: '#ffffff', fontSize: '1.25rem', fontWeight: 900, letterSpacing: '-0.3px' }}>
                  {selectedEntity.label}
                </h3>
                <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontFamily: 'monospace' }}>ENTITY ID: {selectedEntity.id}</span>
              </div>

              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {/* THREAT RISK RATING BAR */}
                <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', padding: '0.9rem 1rem', borderRadius: '8px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontSize: '0.72rem', color: '#64748b', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.5px' }}>THREAT ASSESSMENT RATING</span>
                    <span style={{
                      fontSize: '0.72rem',
                      fontWeight: 900,
                      color: (selectedEntity.risk_score || 5) >= 8 ? '#dc2626' : (selectedEntity.risk_score || 5) >= 6 ? '#d97706' : '#2563eb'
                    }}>
                      {(selectedEntity.risk_score || 5) >= 8 ? 'CRITICAL THREAT' : (selectedEntity.risk_score || 5) >= 6 ? 'ELEVATED RISK' : 'MODERATE'}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                    <div style={{ flex: 1, height: '8px', background: '#e2e8f0', borderRadius: '4px', overflow: 'hidden' }}>
                      <div style={{
                        width: `${(selectedEntity.risk_score || 5) * 10}%`,
                        height: '100%',
                        background: (selectedEntity.risk_score || 5) >= 8 ? 'linear-gradient(90deg, #ef4444, #dc2626)' : 'linear-gradient(90deg, #f59e0b, #d97706)'
                      }}></div>
                    </div>
                    <strong style={{ color: (selectedEntity.risk_score || 5) >= 8 ? '#dc2626' : '#d97706', fontSize: '1.1rem', fontWeight: 900 }}>
                      {selectedEntity.risk_score || 5}/10
                    </strong>
                  </div>
                </div>

                {/* STRUCTURED POLICE DOSSIER METADATA GRID */}
                {selectedEntity.secondary_info && typeof selectedEntity.secondary_info === 'object' && (
                  <div style={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '8px', overflow: 'hidden' }}>
                    <div style={{ background: '#f1f5f9', borderBottom: '1px solid #cbd5e1', padding: '0.6rem 0.9rem', fontSize: '0.72rem', color: '#0b1e36', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      📋 POLICE INTELLIGENCE METADATA
                    </div>

                    <div style={{ padding: '0.75rem 0.9rem', display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
                      {selectedEntity.secondary_info.name && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>👤 Full Name:</span>
                          <strong style={{ color: '#0b1e36', fontSize: '0.86rem' }}>{selectedEntity.secondary_info.name}</strong>
                        </div>
                      )}

                      {selectedEntity.secondary_info.alias && selectedEntity.secondary_info.alias !== 'N/A' && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>🏷️ Alias / Moniker:</span>
                          <span style={{ background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
                            {selectedEntity.secondary_info.alias}
                          </span>
                        </div>
                      )}

                      {selectedEntity.secondary_info.station_name && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>🏢 Police Station:</span>
                          <strong style={{ color: '#0b1e36', fontSize: '0.84rem' }}>{selectedEntity.secondary_info.station_name}</strong>
                        </div>
                      )}

                      {selectedEntity.secondary_info.modus_operandi && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>📜 Crime Category / MO:</span>
                          <span style={{ background: '#f3e8ff', color: '#6b21a8', border: '1px solid #d8b4fe', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
                            {selectedEntity.secondary_info.modus_operandi}
                          </span>
                        </div>
                      )}

                      {selectedEntity.secondary_info.linked_case && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>📄 FIR File No:</span>
                          <strong style={{ color: '#1d4ed8', fontSize: '0.84rem', fontFamily: 'monospace' }}>#{selectedEntity.secondary_info.linked_case}</strong>
                        </div>
                      )}

                      {selectedEntity.secondary_info.status && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9' }}>
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>⚖️ Legal Status:</span>
                          <span style={{ background: '#ecfdf5', color: '#047857', border: '1px solid #a7f3d0', padding: '2px 8px', borderRadius: '4px', fontSize: '0.78rem', fontWeight: 800 }}>
                            {selectedEntity.secondary_info.status}
                          </span>
                        </div>
                      )}

                      {/* Additional Custom Metadata Fields (Formatted cleanly without text overlap) */}
                      {Object.entries(selectedEntity.secondary_info)
                        .filter(([key]) => !['name', 'alias', 'station_name', 'modus_operandi', 'linked_case', 'status', 'notes'].includes(key))
                        .map(([key, val]) => {
                          const strVal = String(val ?? '');
                          const isLong = strVal.length > 25;
                          const formattedKey = key.replace(/_/g, ' ').toUpperCase();

                          if (isLong) {
                            return (
                              <div key={key} style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', paddingBottom: '0.55rem', borderBottom: '1px solid #f1f5f9' }}>
                                <span style={{ color: '#64748b', fontSize: '0.72rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                                  {formattedKey}
                                </span>
                                <div style={{ color: '#0b1e36', fontSize: '0.84rem', fontWeight: 700, lineHeight: '1.45', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
                                  {strVal}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: '0.4rem', borderBottom: '1px solid #f1f5f9', gap: '12px' }}>
                              <span style={{ color: '#64748b', fontSize: '0.78rem', fontWeight: 700 }}>
                                {formattedKey}:
                              </span>
                              <strong style={{ color: '#0b1e36', fontSize: '0.84rem', textAlign: 'right', wordBreak: 'break-word' }}>
                                {strVal}
                              </strong>
                            </div>
                          );
                        })
                      }
                    </div>
                  </div>
                )}

                {/* VERBATIM INVESTIGATION NOTES PANEL */}
                {selectedEntity.secondary_info && typeof selectedEntity.secondary_info === 'object' && selectedEntity.secondary_info.notes && (
                  <div style={{
                    background: '#fafaf9',
                    border: '1px solid #e7e5e4',
                    borderLeft: '4px solid #c5a059',
                    borderRadius: '6px',
                    padding: '0.85rem 1rem'
                  }}>
                    <div style={{ fontSize: '0.72rem', color: '#78716c', fontWeight: 800, textTransform: 'uppercase', marginBottom: '0.4rem', letterSpacing: '0.5px' }}>
                      💬 VERBATIM INVESTIGATION &amp; SURVEILLANCE NOTES
                    </div>
                    <p style={{ margin: 0, fontSize: '0.84rem', color: '#292524', lineHeight: '1.5', fontStyle: 'italic' }}>
                      "{selectedEntity.secondary_info.notes}"
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
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
