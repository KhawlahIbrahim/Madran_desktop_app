import StatusBadge from './StatusBadge';

// Deliberately simple 2D map (current floor only) per MADRAN_MVP_Requirements_v2.md
// §6: "خريطة معقدة → تبسيط الخريطة - عرض الأرضية الحالية فقط".
// Coordinates are the placeholder x/y fields flagged PROVISIONAL in SIN-PD-KH-09,
// pending NE-14's MLP v1.0.
export default function MapView({ members, vitalsByMember }) {
  return (
    <div className="map-view">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="map-svg">
        <rect x="1" y="1" width="98" height="98" rx="2" className="map-floor" />
        <rect x="4" y="4" width="14" height="8" className="map-exit" />
        <text x="6" y="9" className="map-exit-label">EXIT</text>
        <rect x="82" y="88" width="14" height="8" className="map-exit" />
        <text x="84" y="93" className="map-exit-label">EXIT</text>

        {members.map((m) => {
          const v = vitalsByMember[m.id];
          const x = v?.x ?? 50;
          const y = v?.y ?? 50;
          const cls = m.status === 'critical' ? 'dot-critical' : m.status === 'warning' ? 'dot-warning' : 'dot-safe';
          return (
            <g key={m.id} transform={`translate(${x}, ${y})`}>
              <circle r="2.4" className={cls} />
              <text x="0" y="-3.2" className="map-member-label" textAnchor="middle">
                {m.name.split(' ').map((p) => p[0]).join('')}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="map-legend">
        <span><i className="legend-dot dot-safe" /> Safe</span>
        <span><i className="legend-dot dot-warning" /> Warning</span>
        <span><i className="legend-dot dot-critical" /> Critical</span>
      </div>
    </div>
  );
}
