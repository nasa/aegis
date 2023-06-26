import { FunctionComponent, useCallback, useEffect, useRef, useState } from "react";
import { refEqual, shallowEqual, useAppSelector } from "utils/useAppSelector";
import styles from "./map-sunearth.module.css";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faEarthAmerica, faSun } from "@fortawesome/free-solid-svg-icons";

export const SunEarthPosition: FunctionComponent = () => {
  const containerRef = useRef<HTMLDivElement>(null);
  const mission = useAppSelector((state) => state.mission.mission, refEqual);
  const rightPanelOpen = useAppSelector((state) => state.interface.rightPanelOpen, shallowEqual);

  const [containerSize, setContainerSize] = useState<number[]>([0, 0]);
  const [sunIconPosition, setSunIconPosition] = useState({ x: 0, y: 0 });
  const [earthIconPosition, setEarthIconPosition] = useState({ x: 0, y: 0 });

  const getIconPosition = useCallback(
    (angle: number) => {
      if (!containerRef.current) return { x: 0, y: 0 };

      const containerCenterX = containerSize[0] / 2;
      const containerCenterY = containerSize[1] / 2;

      const iconWidth = 20;
      const iconHeight = 20;

      const iconHalfWidth = iconWidth / 2;
      const iconHalfHeight = iconHeight / 2;

      const iconX =
        containerCenterX -
        iconHalfWidth +
        Math.sin(angle * (Math.PI / 180)) * (containerSize[0] / 2 - iconHalfWidth);
      const iconY =
        containerCenterY -
        iconHalfHeight -
        Math.cos(angle * (Math.PI / 180)) * (containerSize[1] / 2 - iconHalfHeight);

      return { x: iconX, y: iconY };
    },
    [containerSize]
  );

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

  useEffect(() => {
    if (!containerRef.current || !mission) return;

    setSunIconPosition(getIconPosition(mission.sunAzimuth));
    setEarthIconPosition(getIconPosition(mission.earthAzimuth));
  }, [mission, containerRef, getIconPosition]);

  return (
    <div ref={containerRef} className={styles.sunEarthPositionContainer}>
      {mission?.sunAzimuthVisible && (
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
      )}

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
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={0 - containerSize[1]}
                    x2={x}
                    y2={containerSize[1] * 2}
                    style={{ stroke: "rgb(255,255,0, 0.1)", strokeWidth: 2 }}
                  />
                );
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
                return (
                  <line
                    key={i}
                    x1={x}
                    y1={0 - containerSize[1]}
                    x2={x}
                    y2={containerSize[1] * 2}
                    style={{ stroke: "rgb(0,255,255, 0.1)", strokeWidth: 2 }}
                  />
                );
              })
            }
          </g>
        )}
      </svg>
    </div>
  );
};
