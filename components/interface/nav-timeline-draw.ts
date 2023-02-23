import isNull from "lodash/isNull";
import paper from "paper";
import { hhmmssFromSeconds } from "utils/formatting";

export default class DrawNav {
  gTier1Group: paper.Group;
  gTier1NavGroup: paper.Group;
  gNavBoxLocX: number;

  gTier2Group: paper.Group;
  gTier2BoarderGroup: paper.Group;
  gTier2StartSeconds: number;

  gCursorGroup: paper.Group;
  gNavCursorGroup: paper.Group;

  gNavigatorWidth: number;
  gNavigatorHeight: number;

  gCanvasHeight: number;
  gNavZoomFactor = 50;
  gTier1Height: number;
  navigatorCollapsed: boolean = false;
  gTier2Height: number;
  gTier1PixelsPerSecond: number;
  gTier1SecondsPerPixel: number;
  gTier2PixelsPerSecond: number;
  gTier2SecondsPerPixel: number;
  gTierSpacing: number;
  gTier1Top: number;
  gTier2Top: number;
  gTier1Left: number;
  gTier2Left: number;

  cSecondsIn24Hours = 86400;

  gNavigatorFontFamily = "Ubuntu Mono";
  gNavigatorFontFamilyActivity = "Inter";

  gColorCursor = new paper.Color("#d10b0b");
  gColorNavCursor = new paper.Color("#000000");
  gColorNavBox = new paper.Color("#efefef");
  gColorBarBorder = new paper.Color("#2a282e");

  constructor(
    /** Keep track of dates for bookkeeping purposes */
    readonly dateRendered: Date,
    readonly evaStartSec: number
  ) {}

  initGroups(): void {
    if (typeof this.gTier1Group !== "undefined") {
      this.gTier1Group.removeChildren();
      this.gTier1NavGroup.removeChildren();
      this.gTier2Group.removeChildren();
      this.gCursorGroup.removeChildren();
      this.gNavCursorGroup.removeChildren();
    } else {
      this.gTier1Group = new paper.Group();
      this.gTier1NavGroup = new paper.Group();
      this.gTier2Group = new paper.Group();
      this.gTier2BoarderGroup = new paper.Group();
      this.gCursorGroup = new paper.Group();
      this.gNavCursorGroup = new paper.Group();
    }
  }

  handleMouseMove = (
    event: paper.MouseEvent,
    missionTimeSeconds: number,
    cb: (mxs: number) => void
  ): void => {
    // scram if hovering over play pause controls area
    if (event.point.y > this.gTier1Top && event.point.x < this.gTier1Left) {
      return;
    }
    let mouseXSeconds;
    this.gCursorGroup.removeChildren();
    this.gNavCursorGroup.removeChildren();
    // this.navigatorCollapsed = false;
    this.setDynamicWidthVariables();
    if (event.point.y > this.gTier1Top) {
      //if in tier1
      mouseXSeconds = (event.point.x - this.gTier1Left) * this.gTier1SecondsPerPixel;
      if (mouseXSeconds < 0) mouseXSeconds = 0;
      this.drawNavBox(mouseXSeconds);
      this.drawTier2();
    } else {
      //if in tier 2
      mouseXSeconds =
        (event.point.x - this.gTier2Left) * this.gTier2SecondsPerPixel + this.gTier2StartSeconds;
    }
    this.drawCursor(missionTimeSeconds);
    this.drawNavCursor(mouseXSeconds);
    this.drawTier2();
    cb(mouseXSeconds);
  };

  handleMouseUp = (
    event: paper.MouseEvent,
    cb: (hh: number, mm: number, ss: number) => void
  ): void => {
    let seconds = 0;
    if (event.point.y > this.gTier1Top) {
      seconds = Math.round((event.point.x - this.gTier1Left) * this.gTier1SecondsPerPixel);
      if (seconds < 0) seconds = 0;
    } else {
      //if in tier 2
      seconds = Math.round(
        (event.point.x - this.gTier2Left) * this.gTier2SecondsPerPixel + this.gTier2StartSeconds
      );
    }

    const hh = Math.floor(seconds / 3600);
    const mm = Math.floor((seconds - hh * 3600) / 60);
    const ss = seconds - hh * 3600 - mm * 60;

    this.drawCursor(seconds);
    cb(hh, mm, ss);
  };

  handleMouseLeave = (_event: paper.MouseEvent, cb: () => void): void => {
    // this.navigatorCollapsed = true;
    this.setDynamicWidthVariables();
    this.drawTier1();
    this.drawTier2();
    this.gNavCursorGroup.removeChildren();
    cb();
  };

  setDynamicWidthVariables = (): void => {
    this.gNavigatorWidth = paper.view.size.width;
    this.gNavigatorHeight = paper.view.size.height;

    this.gTier1Left = 158;
    this.gTier2Left = 0;

    this.gTier1PixelsPerSecond = (this.gNavigatorWidth - this.gTier1Left) / this.cSecondsIn24Hours;
    this.gTier1SecondsPerPixel = this.cSecondsIn24Hours / (this.gNavigatorWidth - this.gTier1Left);
    this.gTier2PixelsPerSecond =
      (this.gNavigatorWidth - this.gTier2Left) / (this.cSecondsIn24Hours / this.gNavZoomFactor);
    this.gTier2SecondsPerPixel =
      this.cSecondsIn24Hours / this.gNavZoomFactor / (this.gNavigatorWidth - this.gTier2Left);

    this.gCanvasHeight = 162;

    this.gTier1Height = 52;
    this.gTierSpacing = 2;

    if (this.navigatorCollapsed) {
      this.gTier2Height = 52;
    } else {
      this.gTier2Height = 74;
    }

    this.gTier2Top =
      this.gCanvasHeight - (this.gTier1Height + this.gTier2Height + this.gTierSpacing);
    this.gTier1Top = this.gTier2Top + this.gTier2Height + this.gTierSpacing;
  };

  drawCursor = (seconds: number): void => {
    this.gCursorGroup.removeChildren();
    this.gCursorGroup.addChild(this.getCursorElement(seconds, this.gColorCursor));
  };

  drawNavCursor = (seconds: number): void => {
    this.gNavCursorGroup.removeChildren();
    this.gNavCursorGroup.addChild(this.getCursorElement(seconds, this.gColorNavCursor));
  };

  getCursorElement = (seconds: number, color: paper.Color): paper.Group => {
    const cursorElementGroup = new paper.Group();

    // tier1
    let cursorLocX = 0.5 + seconds * this.gTier1PixelsPerSecond + this.gTier1Left;
    let topPoint = new paper.Point(cursorLocX, this.gTier1Top + 2);
    let bottomPoint = new paper.Point(cursorLocX, this.gTier1Top + this.gTier1Height - 2);
    let aLine = new paper.Path.Line(topPoint, bottomPoint);
    aLine.strokeColor = color;
    aLine.strokeWidth = 2;
    cursorElementGroup.addChild(aLine);

    // tier2
    cursorLocX = this.gTier2Left + (seconds - this.gTier2StartSeconds) * this.gTier2PixelsPerSecond;
    topPoint = new paper.Point(cursorLocX, this.gTier2Top - 1);
    bottomPoint = new paper.Point(cursorLocX, this.gTier2Top + this.gTier2Height);
    aLine = new paper.Path.Line(topPoint, bottomPoint);
    aLine.strokeColor = color;
    aLine.strokeWidth = 2;
    cursorElementGroup.addChild(aLine);

    //default values for days without EVA
    let timeTextFontSize = 20;
    let timeTextYPos = this.gTier2Top - 3;
    let timeTextFontFamily = this.gNavigatorFontFamily;
    let timeTextRectWidth = 115;
    let timeTextRectHeightNudge = 5;
    let timeTextRectTopNudge = -2;

    const timeTextGroup = new paper.Group();
    // if this is an EVA day, then show PET in the cursor value
    if (!isNull(this.evaStartSec)) {
      const petText = new paper.PointText({
        justification: "left",
        fontWeight: "normal",
        fontFamily: this.gNavigatorFontFamilyActivity,
        fontSize: 12,
        fillColor: "white",
      });
      petText.content = "PET: " + hhmmssFromSeconds(Math.round(seconds - this.evaStartSec));
      petText.point = new paper.Point(cursorLocX - petText.bounds.width / 2, timeTextYPos - 15);
      timeTextGroup.addChild(petText);

      //override GMT time display with values to accommodate PET text
      timeTextFontSize = 15;
      timeTextYPos = this.gTier2Top - 3;
      timeTextFontFamily = this.gNavigatorFontFamilyActivity;
      timeTextRectWidth = 100;
      timeTextRectHeightNudge = 8;
      timeTextRectTopNudge = -5;
    }

    const timeText = new paper.PointText({
      justification: "left",
      fontWeight: "normal",
      fontFamily: timeTextFontFamily,
      fontSize: timeTextFontSize,
      fillColor: "white",
    });
    timeText.content = " " + hhmmssFromSeconds(seconds) + "Z";
    timeText.point = new paper.Point(cursorLocX - timeText.bounds.width / 2, timeTextYPos);
    const cornerSize = new paper.Size(4, 4);
    timeTextGroup.addChild(timeText);

    const timeTextRect = new paper.Rectangle(timeTextGroup.bounds);
    //center rectangle behind text
    timeTextRect.width = timeTextRectWidth;
    timeTextRect.height += timeTextRectHeightNudge;
    timeTextRect.top += timeTextRectTopNudge;
    if (timeTextGroup.position.x - timeTextGroup.bounds.width / 2 < 5) {
      timeTextGroup.position.x = 5 + timeTextGroup.bounds.width / 2;
    } else if (timeTextGroup.position.x > this.gNavigatorWidth - timeTextGroup.bounds.width / 2) {
      timeTextGroup.position.x = this.gNavigatorWidth - timeTextGroup.bounds.width / 2;
    }
    timeTextRect.left = timeTextGroup.position.x - timeTextRectWidth / 2;
    const timeTextRectPath = new paper.Path.Rectangle(timeTextRect, cornerSize);
    timeTextRectPath.fillColor = color;
    timeTextRectPath.opacity = 0.7;
    cursorElementGroup.addChild(timeTextRectPath);
    cursorElementGroup.addChild(timeTextGroup);

    return cursorElementGroup;
  };

  drawTimeTicks(param: {
    secondsStart: number;
    secondsEnd: number;
    pixelsPerSecond: number;
    leftPx: number;
    tierTop: number;
    textTop: number;
    tierTickHeight: number;
    textTickHeight: number;
  }): paper.Group {
    // display time ticks
    const group = new paper.Group();
    for (let i = param.secondsStart; i < param.secondsEnd; i++) {
      // sillily complex thing to show time ticks on the hour
      if (
        parseInt(hhmmssFromSeconds(i).substring(3, 5)) % (10 * 60) === 0 &&
        hhmmssFromSeconds(i).substring(6, 8) === "00"
      ) {
        const itemSecondsFromLeft = i - param.secondsStart;
        const itemLocX = param.leftPx + itemSecondsFromLeft * param.pixelsPerSecond;

        //draw full height faint line
        const tierTopPoint = new paper.Point(itemLocX, param.tierTop);
        const tierBottomPoint = new paper.Point(itemLocX, param.tierTop + param.tierTickHeight);
        const faintLine = new paper.Path.Line(tierTopPoint, tierBottomPoint);
        faintLine.strokeColor = new paper.Color("#505050");
        group.addChild(faintLine);

        //draw brighter tick next to hour number
        const textTopPoint = new paper.Point(itemLocX, param.textTop);
        const textBottomPoint = new paper.Point(itemLocX, param.textTop + param.textTickHeight);
        const textLine = new paper.Path.Line(textTopPoint, textBottomPoint);
        textLine.strokeColor = new paper.Color("#7b7b7b");
        group.addChild(textLine);

        //draw hour number
        const hourNumber = Math.floor(i / 3600);
        const hourText = new paper.PointText({
          justification: "left",
          fontFamily: this.gNavigatorFontFamilyActivity,
          //fontWeight: 'bold',
          fontSize: 12,
          fillColor: "#7b7b7b",
          content: hourNumber + "Z",
        });
        hourText.point = new paper.Point(itemLocX + 4, param.textTop + 10);
        group.addChild(hourText);
      }
    }
    return group;
  }

  drawTier1(): void {
    this.gTier1Group.removeChildren();

    // const drawingTop = this.gTier1Top + 0.5;
    const drawingBottom = this.gTier1Top + this.gTier1Height - this.gTierSpacing + 0.5;
    const drawingHeight = this.gTier1Height;

    const pixelsPerSecond = this.gTier1PixelsPerSecond;
    const secondsStart = 0;
    const secondsEnd = this.cSecondsIn24Hours;
    const leftPx = this.gTier1Left;

    this.gTier1Group.addChild(
      this.drawTimeTicks({
        secondsStart,
        secondsEnd,
        pixelsPerSecond,
        leftPx,
        tierTop: this.gTier1Top,
        textTop: drawingBottom - 10,
        tierTickHeight: drawingHeight,
        textTickHeight: 10,
      })
    );
  }

  drawTier2(): void {
    this.gTier2Group.removeChildren();

    const drawingBottom = this.gTier2Top + this.gTier2Height + 0.5;
    const drawingHeight = this.gTier2Height;

    // const drawLabels = !this.navigatorCollapsed;

    const pixelsPerSecond = this.gTier2PixelsPerSecond;
    const secondsStart = this.gTier2StartSeconds;
    const secondsEnd = this.gTier2StartSeconds + this.gTier2SecondsPerPixel * this.gNavigatorWidth;

    const leftPx = this.gTier2Left;

    this.gTier2Group.addChild(
      this.drawTimeTicks({
        secondsStart,
        secondsEnd,
        pixelsPerSecond,
        leftPx,
        tierTop: this.gTier2Top,
        textTop: drawingBottom - 12,
        tierTickHeight: drawingHeight,
        textTickHeight: 10,
      })
    );
  }

  drawNavBox = (seconds: number): void => {
    this.gTier1NavGroup.removeChildren();

    const locX = seconds * this.gTier1PixelsPerSecond + this.gTier1Left;
    const navBoxWidth = (this.gNavigatorWidth - this.gTier1Left) / this.gNavZoomFactor;
    this.gNavBoxLocX = locX - navBoxWidth / 2;
    if (this.gNavBoxLocX < this.gTier1Left) {
      this.gNavBoxLocX = this.gTier1Left;
    } else if (this.gNavBoxLocX + navBoxWidth > this.gNavigatorWidth) {
      this.gNavBoxLocX = this.gNavigatorWidth - navBoxWidth;
    }
    this.gTier2StartSeconds = this.gTier1SecondsPerPixel * (this.gNavBoxLocX - this.gTier1Left);

    const navBoxTop = this.gTier1Top;
    const navBoxHeight = this.gTier1Height;
    const navBoxRect = new paper.Rectangle(this.gNavBoxLocX, navBoxTop, navBoxWidth, navBoxHeight);
    const cornerSize = new paper.Size(3, 3);
    const navBoxRectPath = new paper.Path.Rectangle(navBoxRect, cornerSize);
    navBoxRectPath.strokeColor = this.gColorNavBox;
    navBoxRectPath.strokeWidth = 2;
    this.gTier1NavGroup.addChild(navBoxRectPath);

    //left navBoxEffect
    const effectHeight = 20;
    let startPoint = new paper.Point(this.gNavBoxLocX, this.gTier1Top + effectHeight);
    const effectSideWidth = 20;
    const navBoxEffectLeft = new paper.Path({
      strokeColor: this.gColorNavBox,
      closed: false,
      fillColor: "#efefef",
      strokeWidth: 2,
    });
    navBoxEffectLeft.add(startPoint);
    navBoxEffectLeft.arcTo(
      new paper.Point(startPoint.x - effectSideWidth / 1.2, startPoint.y - effectHeight),
      new paper.Point(startPoint.x - effectSideWidth, startPoint.y - effectHeight)
    );
    navBoxEffectLeft.lineTo(new paper.Point(startPoint.x, startPoint.y - effectHeight));
    this.gTier1NavGroup.addChild(navBoxEffectLeft);

    //right navBoxEffect
    startPoint = new paper.Point(this.gNavBoxLocX + navBoxWidth, this.gTier1Top + effectHeight);
    const navBoxEffectRight = new paper.Path({
      strokeColor: this.gColorNavBox,
      closed: false,
      fillColor: this.gColorNavBox,
      strokeWidth: 2,
    });
    navBoxEffectRight.add(startPoint);
    navBoxEffectRight.arcTo(
      new paper.Point(startPoint.x + effectSideWidth / 1.2, startPoint.y - effectHeight),
      new paper.Point(startPoint.x + effectSideWidth, startPoint.y - effectHeight)
    );
    navBoxEffectRight.lineTo(new paper.Point(startPoint.x, startPoint.y - effectHeight));
    this.gTier1NavGroup.addChild(navBoxEffectRight);

    //Timeline separator bar full width
    const navBoxEffectBar = new paper.Path.Line({
      from: [0, this.gTier1Top],
      to: [this.gNavigatorWidth, this.gTier1Top],
      strokeColor: this.gColorNavBox,
      strokeWidth: this.gTierSpacing,
    });
    this.gTier1NavGroup.addChild(navBoxEffectBar);
  };
}
