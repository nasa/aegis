import { FunctionComponent, useEffect, useRef, useState } from "react";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import styles from "./map-sunearth.module.css";

export const SunEarthPosition: FunctionComponent = () => {
  const containerRef = useRef<HTMLDivElement>();
  const mission = useAppSelector((state) => state.mission.mission, refEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, shallowEqual);

  const [containerSize, setContainerSize] = useState<number[]>([0, 0]);

  useEffect(() => {
    if (!containerRef.current) return;
    function updateSize() {
      const container = containerRef.current;

      setContainerSize([container.clientWidth, container.clientHeight]);
    }
    window.addEventListener("resize", updateSize);
    updateSize();
    return () => window.removeEventListener("resize", updateSize);
  }, [containerRef, rightPanelOpen]);

  const chevronLength = 5;

  const generateLineWithChevrons = (i: number, x: number, color: string) => {
    return (
      <>
        <line
          key={`${i}line`}
          x1={x}
          y1={0 - containerSize[1]}
          x2={x}
          y2={containerSize[1] * 2}
          style={{ stroke: `rgb(${color}, 0.1)`, strokeWidth: 2 }}
        />
        {/* Draw two sides of a chevron at the midpoint of the above line */}
        <line
          key={`${i}chevronleft`}
          x1={x}
          y1={0}
          x2={x + chevronLength}
          y2={chevronLength}
          style={{ stroke: `rgb(${color}, 0.2 )`, strokeWidth: 2 }}
        />
        <line
          key={`${i}chevronleft`}
          x1={x}
          y1={0}
          x2={x - chevronLength}
          y2={chevronLength}
          style={{ stroke: `rgb(${color}, 0.2)`, strokeWidth: 2 }}
        />
      </>
    );
  };

  return (
    <div ref={containerRef} className={styles.sunEarthPositionContainer}>
      {/* {mission?.sunAzimuthVisible && (
        <div className={styles.icon} style={{ left: sunIconPosition.x, top: sunIconPosition.y }}>
          <FontAwesomeIcon size="lg" icon={faSun} color="rgb(255,255,0)" />
        </div>
      )}
      {mission?.earthAzimuthVisible && (
        <div
          className={styles.icon}
          style={{ left: earthIconPosition.x, top: earthIconPosition.y }}
        >
          <FontAwesomeIcon size="lg" icon={faEarthAmerica} color="rgb(0,255,255)" />
        </div>
      )} */}

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
