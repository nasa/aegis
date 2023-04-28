import { setEvasCalculatedFields } from "store/eva";
import appCreateAsyncThunk from "./thunkUtil";

export const thunkCreateEvasCalculatedFields = appCreateAsyncThunk<void>(
  "createEvasCalculatedFields",
  async (_, { dispatch, getState }) => {
    const stationsCalculatedFields = getState().station.calculatedFields;
    const traversesCalculatedFields = getState().traverse.calculatedFields;
    const evas = getState().eva.evas;

    const allCalculatedFields: EvaCalculatedFields[] = [];
    for (const eva of evas) {
      // go through eva sequence and calculate things
      const evaSequence = eva.sequence;

      //generate report messages
      const newReportItems: ReportItem[] = [];

      // check if no sequence items
      if (eva.sequence.length === 0) {
        newReportItems.push({
          message: "EVA has no stations or traverses",
          type: "warning",
        } as ReportItem);
      }

      const evaCalculatedFields: EvaCalculatedFields = {
        uuid: eva.uuid,
        reportItems: [], // report items for the eva itself
        totalStationTime: {
          durationLower: 0,
          durationUpper: 0,
        },
        totalStationActionCount: 0,
        totalTraverseTime: 0,
        totalTraverseDistanceMeters: 0,
        totalTraverseAscentDescent: {
          totalMetersClimbed: 0,
          totalMetersDescended: 0,
        },
        totalEvaTime: {
          durationLower: 0,
          durationUpper: 0,
        },
      };

      for (const seqItem of evaSequence) {
        const thisStationCalculatedFields = stationsCalculatedFields.find(
          (stationCalculatedFields) => stationCalculatedFields.uuid === seqItem.uuid
        );
        const thisTraverseCalculatedFields = traversesCalculatedFields.find(
          (traverseCalculatedFields) => traverseCalculatedFields.uuid === seqItem.uuid
        );
        if (thisStationCalculatedFields) {
          evaCalculatedFields.totalStationTime.durationLower +=
            thisStationCalculatedFields.totalTime.durationLower;
          evaCalculatedFields.totalStationTime.durationUpper +=
            thisStationCalculatedFields.totalTime.durationUpper;
          evaCalculatedFields.totalStationActionCount += thisStationCalculatedFields.actionCount;
        } else if (thisTraverseCalculatedFields) {
          evaCalculatedFields.totalTraverseTime += thisTraverseCalculatedFields.durationMinutes;
          evaCalculatedFields.totalTraverseDistanceMeters +=
            thisTraverseCalculatedFields.distanceMeters;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersClimbed +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersClimbed;
          evaCalculatedFields.totalTraverseAscentDescent.totalMetersDescended +=
            thisTraverseCalculatedFields.ascentDescent.totalMetersDescended;
        }
      }
      evaCalculatedFields.totalEvaTime.durationLower =
        evaCalculatedFields.totalStationTime.durationLower + evaCalculatedFields.totalTraverseTime;
      evaCalculatedFields.totalEvaTime.durationUpper =
        evaCalculatedFields.totalStationTime.durationUpper + evaCalculatedFields.totalTraverseTime;

      // check if max time exceeds limit

      // check if max time exceeds limit but is still within nominal
      if (
        eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationLower <= eva.maxDuration
      ) {
        newReportItems.push({
          message:
            "Calculated max EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
            " minutes but calculated nominal EVA duration is within limit",
          type: "warning",
        } as ReportItem);
      } else if (
        // check if max time exceeds limit and is also above nominal
        eva.maxDuration &&
        evaCalculatedFields.totalEvaTime.durationUpper > eva.maxDuration
      ) {
        newReportItems.push({
          message:
            "Calculated max EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationUpper - eva.maxDuration).toFixed(0) +
            " minutes",
          type: "error",
        } as ReportItem);
      }
      // check if nominal time exceeds limit
      if (eva.maxDuration && evaCalculatedFields.totalEvaTime.durationLower > eva.maxDuration) {
        newReportItems.push({
          message:
            "Calculated nominal EVA duration exceeds defined maximum by " +
            (evaCalculatedFields.totalEvaTime.durationLower - eva.maxDuration).toFixed(0) +
            " minutes",
          type: "error",
        } as ReportItem);
      }

      evaCalculatedFields.reportItems = newReportItems;

      allCalculatedFields.push(evaCalculatedFields);
    }
    dispatch(setEvasCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);
