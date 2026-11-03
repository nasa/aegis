// React 19 moved JSX into React.JSX. Keep existing application annotations and
// @dnd-kit/core 6 / @uiw/react-color 2 declarations compatible without weakening
// library type checking or duplicating React's element definitions.
declare namespace JSX {
  type Element = import("react").JSX.Element;
  type IntrinsicElements = import("react").JSX.IntrinsicElements;
}
