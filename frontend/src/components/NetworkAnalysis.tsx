import React, { useEffect, useState, useRef } from 'react';
import ForceGraph2D from 'react-force-graph-2d';
import ReactMarkdown from 'react-markdown';
import { useLanguage } from '../LanguageContext';

export const NetworkAnalysis: React.FC = () => {
  const { t } = useLanguage();
  const [data, setData] = useState<{ nodes: any[], links: any[] }>({ nodes: [], links: [] });
  const [explanation, setExplanation] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<any | null>(null);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const [dimensions, setDimensions] = useState({ width: 800, height: 600 });

  useEffect(() => {
    // Responsive canvas
    const updateDimensions = () => {
      if (containerRef.current) {
        setDimensions({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight
        });
      }
    };
    window.addEventListener('resize', updateDimensions);
    updateDimensions();

    return () => window.removeEventListener('resize', updateDimensions);
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/network/analyze');
        if (!res.ok) {
          throw new Error('Failed to fetch network data');
        }
        const json = await res.json();
        
        // QuickML outputs might need fixing if nodes or links are undefined
        const nodes = json.nodes || [];
        const links = json.links || [];
        
        setData({ nodes, links });
        setExplanation(json.explanation || 'No explanation provided.');
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  // Styling helpers
  const getNodeColor = (node: any) => {
    const group = (node.group || '').toLowerCase();
    if (group.includes('accused') || group.includes('criminal')) return '#ef4444'; // Red
    if (group.includes('victim')) return '#3b82f6'; // Blue
    if (group.includes('location')) return '#eab308'; // Yellow
    if (group.includes('case')) return '#a855f7'; // Purple
    return '#9ca3af'; // Gray
  };

  return (
    <div className="network-dashboard">
      <div className="network-header">
        <h3>{t("Criminal Network & Relationship Analysis")}</h3>
        <p>{t("AI is autonomously analyzing the KSP database to detect organized crime rings and hidden links.")}</p>
      </div>

      {loading ? (
        <div className="network-loading">
          <div className="spinner"></div>
          <p>{t("AI Intelligence Analyst is querying the database...")}</p>
        </div>
      ) : error ? (
        <div className="network-error">
          <p>{t("Error analyzing network:")} {error}</p>
        </div>
      ) : (
        <div className="network-content">
          <div className="network-graph-container" ref={containerRef}>
            <ForceGraph2D
              width={dimensions.width}
              height={dimensions.height}
              graphData={data}
              nodeLabel="label"
              nodeColor={getNodeColor}
              nodeRelSize={6}
              linkColor={() => '#4b5563'} // Gray for links
              linkWidth={1.5}
              linkDirectionalArrowLength={3.5}
              linkDirectionalArrowRelPos={1}
              onNodeClick={(node) => setSelectedNode(node)}
              backgroundColor="#0b1320" // Dark match theme
            />
            
            {/* Glassmorphism Node Details Modal */}
            {selectedNode && (
              <div className="node-details-panel">
                <button className="close-btn" onClick={() => setSelectedNode(null)}>×</button>
                <h4>{selectedNode.label}</h4>
                <div className="node-meta">
                  <span className="badge" style={{ backgroundColor: getNodeColor(selectedNode) }}>
                    {selectedNode.group || 'Entity'}
                  </span>
                </div>
                {selectedNode.details && (
                  <p className="node-desc">{selectedNode.details}</p>
                )}
              </div>
            )}
          </div>

          <div className="network-sidebar glass-panel">
            <h4>{t("AI Intelligence Report")}</h4>
            <div className="explanation-markdown">
              <ReactMarkdown>{explanation}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
