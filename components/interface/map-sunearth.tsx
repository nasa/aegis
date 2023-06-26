import {
  FunctionComponent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import styles from "./map-sunearth.module.css";
import React from "react";

export const SunEarthPosition: FunctionComponent = () => {
  const containerRef = useRef<HTMLDivElement>();
  const mission = useAppSelector((state) => state.mission.mission, refEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, shallowEqual);

  const [containerSize, setContainerSize] = useState<number[]>([0, 0]);

  // delay the update of the container size to give time for React to return the correct size
  const updateSizeDelay = useCallback(() => {
    setTimeout(() => {
      const container = containerRef.current;
      setContainerSize([container.clientWidth, container.clientHeight]);
    }, 750);
  }, [containerRef]);

  // update the container size immediately
  const updateSize = useCallback(() => {
    const container = containerRef.current;
    setContainerSize([container.clientWidth, container.clientHeight]);
  }, [containerRef]);

  useLayoutEffect(() => {
    // delay initial update of container size
    updateSizeDelay();
    window.addEventListener("resize", updateSize);
    return () => window.removeEventListener("resize", updateSize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!containerRef.current) return;
    updateSize();
  }, [containerRef, rightPanelOpen, updateSize]);

  const chevronLength = 5;

  const generateLineWithChevrons = (i: number, x: number, color: string) => {
    return (
      <React.Fragment key={i}>
        <line
          key={`${i}line`}
          x1={x}
          y1={0 - containerSize[1]}
          x2={x}
          y2={containerSize[1] * 2}
          style={{ stroke: `rgb(${color}, 0.1)`, strokeWidth: 2 }}
        />
        <line
          key={`${i}chevronleft`}
          x1={x}
          y1={0}
          x2={x + chevronLength}
          y2={chevronLength}
          style={{ stroke: `rgb(${color}, 0.2 )`, strokeWidth: 2 }}
        />
        <line
          key={`${i}chevronright`}
          x1={x}
          y1={0}
          x2={x - chevronLength}
          y2={chevronLength}
          style={{ stroke: `rgb(${color}, 0.2)`, strokeWidth: 2 }}
        />
      </React.Fragment>
    );
  };

  return (
    <div ref={containerRef} className={styles.sunEarthPositionContainer}>
      <svg height={containerSize[1]} width={containerSize[0]} className={styles.svg}>
        {mission?.sunAzimuthVisible && (
          <g
            transform={`translate(${containerSize[1] / 2},${containerSize[1] / 2}) rotate(${
              mission?.sunAzimuth
            })`}
          >
            {
              // draw vertical parallel lines across the screen. They are rotated in the group above
              Array.from(Array(40).keys()).map((i) => {
                const x = (i + 1) * ((containerSize[0] * 2) / 40) - containerSize[0];
                return generateLineWithChevrons(i, x, "255,255,0");
              })
            }
          </g>
        )}
        {mission?.earthAzimuthVisible && (
          <g
            transform={`translate(${containerSize[1] / 2},${containerSize[1] / 2}) rotate(${
              mission?.earthAzimuth
            })`}
          >
            {
              // draw vertical parallel lines across the screen. They are rotated in the group above
              Array.from(Array(40).keys()).map((i) => {
                const x = (i + 1) * ((containerSize[0] * 2) / 40) - containerSize[0];
                return generateLineWithChevrons(i, x, "0,255,255");
              })
            }
          </g>
        )}
      </svg>
    </div>
  );
};

export default SunEarthPosition;
