import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

// Rendered on a fixed white background regardless of portal theme — barcode
// scanners need real black-on-white contrast, not whatever the venue's dark
// or tinted card colours happen to be.
export default function MeterBarcode({ meterNumber }: { meterNumber: string }) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    JsBarcode(svgRef.current, meterNumber, {
      format: 'CODE128',
      lineColor: '#000000',
      background: '#FFFFFF',
      width: 2,
      height: 70,
      displayValue: false,
      margin: 0,
    });
  }, [meterNumber]);

  return (
    <div style={{ background: '#FFFFFF', borderRadius: 8, padding: '12px 8px', width: '100%' }}>
      <svg ref={svgRef} style={{ width: '100%', height: 'auto', display: 'block' }} />
    </div>
  );
}
