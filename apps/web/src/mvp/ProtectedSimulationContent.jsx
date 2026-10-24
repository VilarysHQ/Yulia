function preventDirectCopy(event) {
  event.preventDefault();
}

export function ProtectedSimulationContent({ as: Element = 'div', className = '', enabled, children }) {
  return (
    <Element
      className={`${className}${enabled ? ' sim-copy-protected' : ''}`}
      onCopy={enabled ? preventDirectCopy : undefined}
      onContextMenu={enabled ? preventDirectCopy : undefined}
      onDragStart={enabled ? preventDirectCopy : undefined}
    >
      {children}
    </Element>
  );
}
