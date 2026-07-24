import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLanguage } from '../LanguageContext';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet default icon fix for Vite/Webpack bundling issues
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

interface Case {
  id: string;
  case_number: string;
  crime_type: string;
  jurisdiction: string;
  police_station: string;
  landmark: string;
  latitude: number;
  longitude: number;
  reported_date: string;
  status: string;
  dataset?: string;
  details?: string;
  investigating_officer?: string;
}

export const GisMap: React.FC = () => {
  const { t, locale } = useLanguage();
  const navigate = useNavigate();
  const [cases, setCases] = useState<Case[]>([]);
  const [filteredCases, setFilteredCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(true);
  const [dataSource, setDataSource] = useState<'remote' | 'local_fallback' | null>(null);
  const [noResults, setNoResults] = useState(false);

  // Draft/temporary filter state (user fills these in; only applied on Search click)
  const [draftSearch, setDraftSearch] = useState('');
  const [draftType, setDraftType] = useState('');
  const [draftStation, setDraftStation] = useState('');
  const [draftStatus, setDraftStatus] = useState('');
  const [draftStartDate, setDraftStartDate] = useState('');
  const [draftEndDate, setDraftEndDate] = useState('');

  // Active (committed) filter state — drives the actual rendering
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedType, setSelectedType] = useState('');
  const [selectedStation, setSelectedStation] = useState('');
  const [selectedStatus, setSelectedStatus] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Selected Case & Cluster Modal States
  const [selectedCase, setSelectedCase] = useState<Case | null>(null);
  const [selectedCluster, setSelectedCluster] = useState<{ cases: Case[]; latitude: number; longitude: number } | null>(null);

  // Map Toggles
  const [viewMode, setViewMode] = useState<'markers' | 'heatmap'>('markers');

  // Leaflet refs
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const canvasLayerRef = useRef<L.Layer | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Fetch full case details on-demand from /api/cases/:id
  const fetchCaseDetails = useCallback(async (c: Case) => {
    setSelectedCase(c); // Show immediately with available data
    if (c.details) return; // Already have details
    try {
      const lookupId = c.id.startsWith('cm_') ? c.id : (c.case_number || c.id);
      const res = await fetch(`/api/cases/${encodeURIComponent(lookupId)}`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && data.case) {
          setSelectedCase(prev => prev && prev.id === c.id ? { ...prev, details: data.case.details, investigating_officer: data.case.investigating_officer } : prev);
        }
      }
    } catch (err) {
      console.error('Failed to load case details:', err);
    }
  }, []);

  // Load cases from API
  useEffect(() => {
    const fetchCases = async () => {
      try {
        const res = await fetch('/api/cases');
        if (res.ok) {
          const data = await res.json();
          const loadedCases = data.cases || [];
          setCases(loadedCases);
          setFilteredCases(loadedCases);
          setDataSource(data.source);
          if (loadedCases.length > 0 && mapRef.current) {
            const coords = loadedCases
              .filter((c: Case) => typeof c.latitude === 'number' && !isNaN(c.latitude) && typeof c.longitude === 'number' && !isNaN(c.longitude))
              .map((c: Case) => [c.latitude, c.longitude] as [number, number]);
            if (coords.length > 0) {
              mapRef.current.fitBounds(L.latLngBounds(coords), { padding: [50, 50] });
            }
          }
        }
      } catch (err) {
        console.error('Failed to load cases:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchCases();
  }, []);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      center: [12.9716, 77.5946],
      zoom: 11,
      minZoom: 4,
      zoomControl: false,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'topright' }).addTo(map);

    mapRef.current = map;
    markersLayerRef.current = L.layerGroup().addTo(map);

    // Invalidate size after container renders to prevent grey tile background
    const timer = setTimeout(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    }, 200);

    const resizeObserver = new ResizeObserver(() => {
      if (mapRef.current) {
        mapRef.current.invalidateSize();
      }
    });

    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      clearTimeout(timer);
      resizeObserver.disconnect();
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
      }
    };
  }, []);

  // Dynamic dropdown options derived from all loaded cases
  const uniqueCrimeTypes = [...new Set(cases.map(c => c.crime_type).filter(Boolean))].sort();
  const uniqueStations = [...new Set(cases.map(c => c.police_station).filter(Boolean))].sort();

  // Apply filters to produce filteredCases
  const applyFilters = useCallback(() => {
    let result = cases;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(c =>
        c.case_number.toLowerCase().includes(q) ||
        c.landmark.toLowerCase().includes(q) ||
        c.crime_type.toLowerCase().includes(q) ||
        c.police_station.toLowerCase().includes(q) ||
        (c.details || '').toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }

    if (selectedType) {
      result = result.filter(c => c.crime_type === selectedType);
    }

    if (selectedStation) {
      result = result.filter(c => c.police_station === selectedStation);
    }

    if (selectedStatus) {
      result = result.filter(c => c.status === selectedStatus);
    }

    if (startDate) {
      result = result.filter(c => c.reported_date >= startDate);
    }

    if (endDate) {
      result = result.filter(c => c.reported_date <= endDate);
    }

    return result;
  }, [cases, searchQuery, selectedType, selectedStation, selectedStatus, startDate, endDate]);

  // Re-filter whenever committed filter state changes
  useEffect(() => {
    const result = applyFilters();
    setFilteredCases(result);
    setNoResults(result.length === 0 && cases.length > 0);
  }, [applyFilters, cases.length]);

  // Search button handler: commit draft state and fly to results
  const handleSearch = () => {
    // Commit draft values to active filter state
    setSearchQuery(draftSearch);
    setSelectedType(draftType);
    setSelectedStation(draftStation);
    setSelectedStatus(draftStatus);
    setStartDate(draftStartDate);
    setEndDate(draftEndDate);

    // We need to compute the results using the draft values directly
    // (since setState is async and won't be reflected yet)
    let result = cases;

    if (draftSearch.trim()) {
      const q = draftSearch.toLowerCase();
      result = result.filter(c =>
        c.case_number.toLowerCase().includes(q) ||
        c.landmark.toLowerCase().includes(q) ||
        c.crime_type.toLowerCase().includes(q) ||
        c.police_station.toLowerCase().includes(q) ||
        (c.details || '').toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q)
      );
    }
    if (draftType) result = result.filter(c => c.crime_type === draftType);
    if (draftStation) result = result.filter(c => c.police_station === draftStation);
    if (draftStatus) result = result.filter(c => c.status === draftStatus);
    if (draftStartDate) result = result.filter(c => c.reported_date >= draftStartDate);
    if (draftEndDate) result = result.filter(c => c.reported_date <= draftEndDate);

    setFilteredCases(result);
    setNoResults(result.length === 0 && cases.length > 0);

    // Map redirection logic
    const map = mapRef.current;
    if (!map) return;

    if (result.length === 0) {
      // No results — reset to default Bengaluru view
      map.flyTo([12.9716, 77.5946], 12, { duration: 1.2 });
    } else if (result.length === 1) {
      // Single match — fly directly to it and open its popup
      const c = result[0];
      map.flyTo([c.latitude, c.longitude], 16, { duration: 1.5 });

      // After flyTo animation completes, open the popup
      setTimeout(() => {
        const markersLayer = markersLayerRef.current;
        if (markersLayer) {
          markersLayer.eachLayer((layer: any) => {
            if (layer.getLatLng) {
              const latlng = layer.getLatLng();
              const dist = Math.abs(latlng.lat - c.latitude) + Math.abs(latlng.lng - c.longitude);
              if (dist < 0.0005) {
                layer.openPopup();
              }
            }
          });
        }
      }, 1600);
    } else {
      // Multiple matches — fit bounds to show all
      const bounds = L.latLngBounds(result.map(c => [c.latitude, c.longitude] as [number, number]));
      map.flyToBounds(bounds, { padding: [50, 50], duration: 1.2 });
    }
  };

  // Reset all filters
  const handleReset = () => {
    setDraftSearch('');
    setDraftType('');
    setDraftStation('');
    setDraftStatus('');
    setDraftStartDate('');
    setDraftEndDate('');
    setSearchQuery('');
    setSelectedType('');
    setSelectedStation('');
    setSelectedStatus('');
    setStartDate('');
    setEndDate('');
    setNoResults(false);

    const map = mapRef.current;
    if (map) {
      map.flyTo([12.9716, 77.5946], 12, { duration: 1.2 });
    }
  };

  // Map Render (Markers or Heatmap)
  useEffect(() => {
    const map = mapRef.current;
    const markersLayer = markersLayerRef.current;
    if (!map || !markersLayer) return;

    // Clear existing markers/layers
    markersLayer.clearLayers();
    if (canvasLayerRef.current) {
      map.removeLayer(canvasLayerRef.current);
      canvasLayerRef.current = null;
    }

    if (filteredCases.length === 0) return;

    if (viewMode === 'markers') {
      const drawMarkers = () => {
        markersLayer.clearLayers();
        const zoom = map.getZoom();
        
        // Simple pixel-distance clustering
        const clusters: { latitude: number; longitude: number; cases: Case[] }[] = [];
        const distanceThreshold = zoom > 14 ? 15 : zoom > 12 ? 35 : 55;

        filteredCases.forEach(c => {
          let added = false;
          const pt = map.latLngToContainerPoint([c.latitude, c.longitude]);

          for (let i = 0; i < clusters.length; i++) {
            const cluster = clusters[i];
            const cpt = map.latLngToContainerPoint([cluster.latitude, cluster.longitude]);
            const dx = pt.x - cpt.x;
            const dy = pt.y - cpt.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < distanceThreshold) {
              cluster.cases.push(c);
              cluster.latitude = (cluster.latitude * (cluster.cases.length - 1) + c.latitude) / cluster.cases.length;
              cluster.longitude = (cluster.longitude * (cluster.cases.length - 1) + c.longitude) / cluster.cases.length;
              added = true;
              break;
            }
          }

          if (!added) {
            clusters.push({
              latitude: c.latitude,
              longitude: c.longitude,
              cases: [c]
            });
          }
        });

        // Add markers/clusters to Leaflet layer
        clusters.forEach(cluster => {
          if (cluster.cases.length === 1) {
            const c = cluster.cases[0];
            const colorClass = c.status === 'Active' ? 'red' : c.status === 'Closed' ? 'green' : 'orange';
            
            const customIcon = L.divIcon({
              className: 'custom-leaflet-marker-wrapper',
              html: `<div class="marker-dot status-${colorClass}" title="${c.case_number}: ${c.crime_type}"></div>`,
              iconSize: [20, 20],
              iconAnchor: [10, 10],
            });

            const marker = L.marker([c.latitude, c.longitude], { icon: customIcon });
            
            const statusLabel = c.status === 'Closed' ? t("Solved Cases") : c.status === 'Active' ? t("Active Cases") : t("Unsolved Cases");
            const popupHtml = `
              <div class="map-popup-card">
                <div class="popup-header">
                  <span class="popup-badge status-${colorClass}">${statusLabel}</span>
                  <span class="popup-case-id">${c.case_number}</span>
                </div>
                <div class="popup-body">
                  <h4 class="popup-title">${t(c.crime_type)}</h4>
                  <p>📍 <strong>${t("Landmark")}:</strong> ${c.landmark}</p>
                  <p>🏢 <strong>${t("Station")}:</strong> ${t(c.police_station)}</p>
                  <p>📅 <strong>${t("Date")}:</strong> ${c.reported_date}</p>
                  <p>🔎 <em>Click marker to view full dossier</em></p>
                </div>
              </div>
            `;
            marker.bindPopup(popupHtml, { minWidth: 220 });
            marker.on('click', () => {
              fetchCaseDetails(c);
            });
            markersLayer.addLayer(marker);
          } else {
            const count = cluster.cases.length;
            const clusterClass = count > 15 ? 'cluster-large' : count > 5 ? 'cluster-medium' : 'cluster-small';
            
            const clusterIcon = L.divIcon({
              className: 'custom-leaflet-cluster-wrapper',
              html: `<div class="cluster-bubble ${clusterClass}"><span>${count}</span></div>`,
              iconSize: [44, 44],
              iconAnchor: [22, 22],
            });

            const marker = L.marker([cluster.latitude, cluster.longitude], { icon: clusterIcon });
            
            const popupHtml = `
              <div class="map-popup-card cluster-popup">
                <h4>📂 ${count} ${t("Cases in this Area")}</h4>
                <div class="popup-cluster-list">
                  ${cluster.cases.slice(0, 4).map(c => `
                    <div class="cluster-list-item">
                      <span><strong>${c.case_number}</strong>: ${t(c.crime_type)}</span>
                    </div>
                  `).join('')}
                  ${count > 4 ? `<div class="cluster-more-text">+ ${count - 4} ${t("more cases")}</div>` : ''}
                </div>
                <p style="margin-top: 6px; font-size: 0.75rem; color: #64748b;">👉 Click cluster to inspect full list & location facts</p>
              </div>
            `;
            marker.bindPopup(popupHtml, { minWidth: 220 });
            marker.on('click', () => {
              setSelectedCluster(cluster);
            });
            markersLayer.addLayer(marker);
          }
        });
      };

      drawMarkers();

      // Debounced redraw on zoom/pan — waits 150ms after user stops moving
      const debouncedDraw = () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = setTimeout(drawMarkers, 150);
      };
      map.on('zoomend', debouncedDraw);
      map.on('moveend', debouncedDraw);

      return () => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
        map.off('zoomend', debouncedDraw);
        map.off('moveend', debouncedDraw);
      };
    } else {
      // Heatmap view using HTML5 Canvas with Additive Radial Blending & Dynamic Zoom Radius
      const CustomCanvasLayer = L.Layer.extend({
        onAdd: function(map: L.Map) {
          const pane = map.getPane('overlayPane')!;
          const container = L.DomUtil.create('canvas', 'leaflet-heatmap-layer') as HTMLCanvasElement;
          this._canvas = container;
          const size = map.getSize();
          container.width = size.x;
          container.height = size.y;
          pane.appendChild(container);
          map.on('move', this._update, this);
          map.on('zoomend', this._update, this);
          this._update();
        },
        onRemove: function(map: L.Map) {
          L.DomUtil.remove(this._canvas);
          map.off('move', this._update, this);
          map.off('zoomend', this._update, this);
        },
        _update: function() {
          const canvas = this._canvas;
          if (!canvas) return;
          const ctx = canvas.getContext('2d');
          if (!ctx) return;

          const size = map.getSize();
          canvas.width = size.x;
          canvas.height = size.y;
          const topLeft = map.containerPointToLayerPoint([0, 0]);
          L.DomUtil.setPosition(canvas, topLeft);
          ctx.clearRect(0, 0, size.x, size.y);

          if (!filteredCases || filteredCases.length === 0) return;

          const currentZoom = map.getZoom();
          // Small, crisp epicenter radius (no big covering circles)
          const radius = currentZoom <= 8 ? 10 : currentZoom <= 12 ? 14 : 18;

          ctx.save();
          ctx.globalCompositeOperation = 'source-over';

          filteredCases.forEach(c => {
            const latlng = L.latLng(c.latitude, c.longitude);
            const pt = map.latLngToContainerPoint(latlng);

            // Skip points outside current canvas bounds
            if (pt.x < -radius || pt.x > size.x + radius || pt.y < -radius || pt.y > size.y + radius) {
              return;
            }

            const radGrad = ctx.createRadialGradient(pt.x, pt.y, 0, pt.x, pt.y, radius);
            radGrad.addColorStop(0.0, 'rgba(220, 38, 38, 0.95)');   // Sharp red epicenter dot
            radGrad.addColorStop(0.25, 'rgba(239, 68, 68, 0.65)');  // Inner heat aura
            radGrad.addColorStop(0.60, 'rgba(245, 158, 11, 0.28)');  // Warm amber transition
            radGrad.addColorStop(1.00, 'rgba(245, 158, 11, 0.00)');  // Slowly transparent near edges

            ctx.fillStyle = radGrad;
            ctx.beginPath();
            ctx.arc(pt.x, pt.y, radius, 0, Math.PI * 2);
            ctx.fill();
          });

          ctx.restore();
        }
      });

      const heatmapLayer = new (CustomCanvasLayer as any)();
      heatmapLayer.addTo(map);
      canvasLayerRef.current = heatmapLayer;
    }
  }, [filteredCases, viewMode, locale]);

  // Statistics for the sidebar
  const getStats = () => {
    const stats: Record<string, number> = {};
    filteredCases.forEach(c => {
      stats[c.crime_type] = (stats[c.crime_type] || 0) + 1;
    });
    return Object.entries(stats).sort((a, b) => b[1] - a[1]);
  };

  return (
    <div className="gis-map-workspace animate-fade-in">
      {/* Data Source Status Banner */}
      {dataSource && (
        <div className={`data-source-toast ${dataSource}`}>
          {dataSource === 'remote' ? (
            <>
              <span className="source-dot live"></span>
              {t("Live connection to Supabase DB active")}
            </>
          ) : (
            <>
              <span className="source-dot fallback"></span>
              {t("Connection failed. Fallback to Local DB")}
            </>
          )}
        </div>
      )}

      {/* Main Map & Dashboard Layout */}
      <div className="map-view-layout">
        {/* Left Side: Leaflet Canvas Map */}
        <div className="map-canvas-container">
          <div ref={mapContainerRef} className="leaflet-map-element" />
          
          {/* No results overlay */}
          {noResults && (
            <div className="map-no-results-overlay">
              <div className="no-results-card">
                <span className="no-results-icon">🔍</span>
                <p>{t("No cases found matching these filters.")}</p>
                <button className="reset-search-btn" onClick={handleReset}>
                  {t("Reset Filters")}
                </button>
              </div>
            </div>
          )}

          {/* Map floating toggles */}
          <div className="map-floating-controls">
            <button 
              className={`map-ctrl-btn ${viewMode === 'markers' ? 'active' : ''}`}
              onClick={() => setViewMode('markers')}
            >
              📍 {t("Marker Clusters")}
            </button>
            <button 
              className={`map-ctrl-btn ${viewMode === 'heatmap' ? 'active' : ''}`}
              onClick={() => setViewMode('heatmap')}
            >
              🔥 {t("Heatmap Density")}
            </button>
          </div>

          {/* Heatmap Intensity Legend Overlay */}
          {viewMode === 'heatmap' && (
            <div style={{
              position: 'absolute',
              bottom: '24px',
              left: '24px',
              background: '#ffffff',
              border: '1px solid #cbd5e1',
              borderRadius: '8px',
              padding: '8px 12px',
              zIndex: 400,
              boxShadow: '0 4px 12px rgba(15, 23, 42, 0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '0.78rem',
              fontWeight: 700,
              color: '#0f172a'
            }}>
              <span>🔥 {t("Crime Heat Density")}:</span>
              <div style={{
                width: '120px',
                height: '10px',
                borderRadius: '5px',
                background: 'linear-gradient(to right, rgba(56, 189, 248, 0.6), rgba(245, 158, 11, 0.8), rgba(239, 68, 68, 0.95))'
              }}></div>
              <span style={{ fontSize: '0.7rem', color: '#64748b' }}>Low &rarr; Hotspot</span>
            </div>
          )}
        </div>

        {/* Right Side: Map Controls & Side Panel Dashboard */}
        <aside className="map-sidebar-control-panel">
          {/* Section 1: Filters */}
          <div className="sidebar-card">
            <h3>🔍 {t("Filter Cases")}</h3>
            
            <div className="filter-input-group">
              <label>{t("Search Keyword")}</label>
              <input
                type="text"
                placeholder={t("Search by FIR ID or landmark...")}
                value={draftSearch}
                onChange={e => setDraftSearch(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleSearch(); }}
                className="map-filter-input"
              />
            </div>

            <div className="filter-input-group">
              <label>{t("Crime Types")}</label>
              <select 
                value={draftType} 
                onChange={e => setDraftType(e.target.value)}
                className="map-filter-select"
              >
                <option value="">{t("All Categories")} ({cases.length})</option>
                {uniqueCrimeTypes.map(type => (
                  <option key={type} value={type}>{t(type)}</option>
                ))}
              </select>
            </div>

            <div className="filter-input-group">
              <label>{t("Police Station")}</label>
              <select 
                value={draftStation} 
                onChange={e => setDraftStation(e.target.value)}
                className="map-filter-select"
              >
                <option value="">{t("All Stations")}</option>
                {uniqueStations.map(station => (
                  <option key={station} value={station}>{t(station)}</option>
                ))}
              </select>
            </div>

            <div className="filter-row-two-col">
              <div className="filter-input-group">
                <label>{t("Start Date")}</label>
                <input
                  type="date"
                  value={draftStartDate}
                  onChange={e => setDraftStartDate(e.target.value)}
                  className="map-filter-input"
                />
              </div>
              <div className="filter-input-group">
                <label>{t("End Date")}</label>
                <input
                  type="date"
                  value={draftEndDate}
                  onChange={e => setDraftEndDate(e.target.value)}
                  className="map-filter-input"
                />
              </div>
            </div>

            <div className="filter-input-group">
              <label>{t("Case Status")}</label>
              <select 
                value={draftStatus} 
                onChange={e => setDraftStatus(e.target.value)}
                className="map-filter-select"
              >
                <option value="">{t("All Statuses")}</option>
                <option value="Active">🔴 {t("Active Cases")}</option>
                <option value="Under Investigation">🟠 {t("Unsolved Cases")} ({t("Under Investigation")})</option>
                <option value="Closed">🟢 {t("Solved Cases")} ({t("Closed")})</option>
              </select>
            </div>

            {/* Search & Reset Buttons */}
            <div className="filter-actions-row">
              <button className="search-cases-btn" onClick={handleSearch}>
                🔍 {t("Search Cases")}
              </button>
              <button className="reset-cases-btn" onClick={handleReset}>
                ↻ {t("Reset")}
              </button>
            </div>
          </div>

          {/* Section 2: Summary Stats */}
          <div className="sidebar-card summary-card">
            <h3>📊 {t("Total Cases")}</h3>
            <div className="big-number-indicator">
              {loading ? (
                <div className="map-loader-mini"></div>
              ) : (
                <span>{filteredCases.length}</span>
              )}
            </div>
            
            {/* Visual Breakdown progress bars */}
            {!loading && filteredCases.length > 0 && (
              <div className="crime-breakdown-list">
                <h4>{t("Crime Distribution")}</h4>
                {getStats().map(([type, count]) => {
                  const percentage = Math.round((count / filteredCases.length) * 100);
                  return (
                    <div key={type} className="breakdown-progress-row">
                      <div className="progress-labels">
                        <span className="progress-type">{t(type)}</span>
                        <span className="progress-count">{count}</span>
                      </div>
                      <div className="progress-bar-track">
                        <div className="progress-bar-fill" style={{ width: `${percentage}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Cluster Inspection Modal */}
      {selectedCluster && (
        <div className="gis-dossier-overlay" onClick={() => setSelectedCluster(null)}>
          <div className="gis-dossier-modal" onClick={e => e.stopPropagation()}>
            <div className="gis-dossier-header">
              <h3>📂 {t("Cluster Location Inspection")} ({selectedCluster.cases.length} {t("Cases")})</h3>
              <button className="gis-dossier-close" onClick={() => setSelectedCluster(null)}>×</button>
            </div>
            <div className="gis-dossier-body">
              <div className="dossier-badge-row">
                <span className="dossier-tag status-active">
                  🔴 {selectedCluster.cases.filter(c => c.status === 'Active').length} {t("Active")}
                </span>
                <span className="dossier-tag status-solved">
                  🟢 {selectedCluster.cases.filter(c => c.status === 'Closed').length} {t("Closed")}
                </span>
                <span className="dossier-tag status-investigation">
                  🟠 {selectedCluster.cases.filter(c => c.status !== 'Active' && c.status !== 'Closed').length} {t("Under Investigation")}
                </span>
              </div>

              <div className="dossier-grid-info">
                <div className="dossier-field">
                  <label>{t("Cluster Coordinates")}</label>
                  <span>{selectedCluster.latitude.toFixed(4)}, {selectedCluster.longitude.toFixed(4)}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Dominant Station")}</label>
                  <span>{selectedCluster.cases[0]?.police_station || 'N/A'}</span>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <h4 style={{ margin: 0, fontSize: '0.9rem', color: 'var(--ksp-navy)', fontWeight: 700 }}>
                  📋 {t("Cases in this Cluster")}
                </h4>
                <div style={{ maxHeight: '280px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {selectedCluster.cases.map(c => (
                    <div
                      key={c.id}
                      style={{
                        padding: '10px 14px',
                        borderRadius: '10px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#f8fafc',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '12px'
                      }}
                    >
                      <div>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--ksp-navy)' }}>
                          {c.case_number} — {t(c.crime_type)}
                        </div>
                        <div style={{ fontSize: '0.78rem', color: '#64748b' }}>
                          📍 {c.landmark} | 📅 {c.reported_date}
                        </div>
                      </div>
                      <button
                        className="popup-inspect-btn"
                        style={{ width: 'auto', marginTop: 0 }}
                        onClick={() => {
                          setSelectedCluster(null);
                          setSelectedCase(c);
                        }}
                      >
                        🔎 {t("Inspect Dossier")}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="gis-dossier-footer">
              <button
                className="gmaps-btn"
                onClick={() => {
                  if (mapRef.current) {
                    mapRef.current.flyTo([selectedCluster.latitude, selectedCluster.longitude], 16, { duration: 1.2 });
                  }
                  setSelectedCluster(null);
                }}
              >
                🎯 {t("Zoom into Area")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Location & Case Dossier Modal */}
      {selectedCase && (
        <div className="gis-dossier-overlay" onClick={() => setSelectedCase(null)}>
          <div className="gis-dossier-modal" onClick={e => e.stopPropagation()}>
            <div className="gis-dossier-header">
              <h3>🚨 {t("Location & FIR Case Dossier")}</h3>
              <button className="gis-dossier-close" onClick={() => setSelectedCase(null)}>×</button>
            </div>
            <div className="gis-dossier-body">
              <div className="dossier-badge-row">
                <span className={`dossier-tag ${selectedCase.status === 'Active' ? 'status-active' : selectedCase.status === 'Closed' ? 'status-solved' : 'status-investigation'}`}>
                  {selectedCase.status === 'Closed' ? `🟢 ${t("Closed / Solved")}` : selectedCase.status === 'Active' ? `🔴 ${t("Active Incident")}` : `🟠 ${t("Under Investigation")}`}
                </span>
                {selectedCase.dataset && (
                  <span className="dossier-tag dataset">
                    📊 Source: {selectedCase.dataset}
                  </span>
                )}
              </div>

              <div className="dossier-grid-info">
                <div className="dossier-field">
                  <label>{t("FIR / Case Number")}</label>
                  <span>{selectedCase.case_number}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Crime Category")}</label>
                  <span>{t(selectedCase.crime_type)}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Police Station")}</label>
                  <span>{t(selectedCase.police_station)}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Reported Date")}</label>
                  <span>{selectedCase.reported_date}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Landmark / Location")}</label>
                  <span>{selectedCase.landmark}</span>
                </div>
                <div className="dossier-field">
                  <label>{t("Coordinates")}</label>
                  <span>{selectedCase.latitude.toFixed(5)}, {selectedCase.longitude.toFixed(5)}</span>
                </div>
              </div>

              {selectedCase.details && (
                <div className="dossier-facts-box">
                  <h4>📜 {t("Case Brief Facts & Particulars")}</h4>
                  <p>{selectedCase.details}</p>
                </div>
              )}
            </div>
            <div className="gis-dossier-footer">
              <a
                href={`https://www.google.com/maps?q=${selectedCase.latitude},${selectedCase.longitude}`}
                target="_blank"
                rel="noopener noreferrer"
                className="gmaps-btn"
              >
                🌐 {t("Open in Google Maps")}
              </a>
              <button
                className="ai-query-btn"
                onClick={() => {
                  navigate(`/chat?query=${encodeURIComponent(`Tell me all available details and investigation records for case ${selectedCase.case_number} at ${selectedCase.police_station}`)}`);
                }}
              >
                💬 {t("Ask AI Assistant about this Case")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GisMap;
