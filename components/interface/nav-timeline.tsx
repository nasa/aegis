import isNil from "lodash/isNil";
import paper from "paper";
import { FunctionComponent, MutableRefObject, useCallback, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { changeTime } from "store/playhead";
import { changeHoverTime } from "store/playheadHover";

import DrawNav from "./nav-timeline-draw";
import { RootState } from "store/index";
import styles from "./nav-timeline-draw.module.css";

/**
 * Renders the navigation timeline presented at the bottom of the CODA window
 */
const NavTimeline: FunctionComponent = () => {
  const playhead: PlayheadState = useSelector((state: RootState) => state.playhead);
  const playheadHover: PlayheadHoverState = useSelector((state: RootState) => state.playheadHover);

  const dispatch = useDispatch();

  const time: MutableRefObject<number> = useRef(0);
  const drawNav: MutableRefObject<DrawNav> = useRef(null);
  const canvas: MutableRefObject<HTMLCanvasElement> = useRef(null);
  const mouseOnNavigator: MutableRefObject<boolean> = useRef(false);
  const navReady: MutableRefObject<boolean> = useRef(false);

  const evaStartSec = 0;

  /** Draw the timeline on the canvas from scratch */
  const installTimeline = useCallback(() => {
    if (isNil(paper.project) && typeof window !== "undefined") {
      paper.setup(canvas.current);
    }

    const playheadDate = new Date(playhead.date);

    drawNav.current = new DrawNav(playheadDate, evaStartSec);

    drawNav.current.initGroups();
    drawNav.current.setDynamicWidthVariables();
    drawNav.current.drawTier1();
    drawNav.current.drawNavBox(time.current);
    drawNav.current.drawTier2();
    // drawNav.current.drawTier1Future();
    drawNav.current.drawCursor(time.current);

    paper.view.onResize = function () {
      drawNav.current.setDynamicWidthVariables();
      drawNav.current.drawTier1();
      // drawNav.current.drawTier1Future();
      drawNav.current.drawNavBox(time.current);
      drawNav.current.drawTier2();
    };

    paper.view.onMouseMove = (event) => {
      drawNav.current.handleMouseMove(event, time.current, (thisHoverSeconds) => {
        if (!mouseOnNavigator.current) {
          mouseOnNavigator.current = true;
        }
        if (playheadHover.seconds !== thisHoverSeconds) {
          dispatch(changeHoverTime(thisHoverSeconds));
        }
      });
    };
    paper.view.onMouseUp = (event) => {
      drawNav.current.handleMouseUp(event, (hh: number, mm: number, ss: number) => {
        const secondsIntoDate = ss + 60 * mm + 3600 * hh;
        dispatch(changeTime(secondsIntoDate));
      });
    };
    paper.view.onMouseLeave = (event) => {
      drawNav.current?.handleMouseLeave(event, () => {
        mouseOnNavigator.current = false;
        drawNav.current.drawNavBox(time.current);
        drawNav.current.drawTier2();
        drawNav.current.drawCursor(time.current);
        dispatch(changeHoverTime(0));
      });
    };

    if (!navReady.current) {
      navReady.current = true;
    }
  }, [dispatch, playhead, playheadHover]);

  useEffect(() => {
    // only setup the canvas once
    if (isNil(paper.project) && typeof window !== "undefined") {
      installTimeline();
    }
    return () => paper.project.remove();
  }, [playhead.date, installTimeline]);

  useEffect(() => {
    if (paper.project) {
      paper.project.remove();
    }
    installTimeline();
  }, [installTimeline]);

  useEffect(() => {
    time.current = playhead.seconds;

    if (!navReady.current) {
      // nothing to update if the paperjs timeline hasn't been instantiated
      return;
    }

    if (!mouseOnNavigator.current) {
      drawNav.current.drawTier1();
      drawNav.current.drawNavBox(time.current);
      // drawNav.current.drawTier1Future();
    }
    drawNav.current.drawTier2();
    drawNav.current.drawCursor(time.current);
  }, [playhead.seconds]);

  return (
    <>
      {/* {!mouseOnNavigator.current && <div className={styles.collapsedBackground}></div>}
      {mouseOnNavigator.current && <div className={styles.expandedBackground}></div>} */}
      <div className={styles.expandedBackground}></div>
      <div className={styles.canvasContainer}>
        <canvas ref={canvas} data-paper-resize />
      </div>
    </>
  );
};

export default NavTimeline;
