import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import L from 'leaflet';
import { useMap } from 'react-leaflet';

/**
 * A Leaflet control container at `position`; clicks and wheel scrolls inside it
 * do not reach the map. Null until the control is on the map.
 */
export function useLeafletControl(position: L.ControlPosition, className: string): HTMLElement | null {
  const map = useMap();
  const [container, setContainer] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const control = new L.Control({ position });
    control.onAdd = () => {
      const div = L.DomUtil.create('div', className);
      L.DomEvent.disableClickPropagation(div);
      L.DomEvent.disableScrollPropagation(div);
      return div;
    };
    control.addTo(map);
    setContainer(control.getContainer() ?? null);
    return () => {
      control.remove();
      setContainer(null);
    };
  }, [map, position, className]);
  return container;
}

/** Renders `children` into a Leaflet control. */
export function MapControl({ position, className, children }: {
  position: L.ControlPosition; className: string; children: ReactNode;
}) {
  const container = useLeafletControl(position, className);
  return container ? createPortal(children, container) : null;
}
