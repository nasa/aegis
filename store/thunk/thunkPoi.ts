import { setPoiCalculatedFields } from "store/poi";
import appCreateAsyncThunk from "./thunkUtil";

/**
 * Create reports for all pois
 */
export const thunkCreatePoiCalculatedFields = appCreateAsyncThunk<void>(
  "createPoiCalculatedFields",
  async (_, { dispatch, getState }) => {
    const pois = getState().poi.pois;
    const allCalculatedFields: PoiCalculatedFields[] = [];
    for (const poi of pois) {
      //get poi actions
      const poiActions = getState().action.actions.filter(
        (storeAction) => storeAction.poiUuid === poi.uuid
      );

      //calculate total time
      let totalDurationLower = 0;
      let totalDurationUpper = 0;
      let actionCount = 0;
      poiActions.forEach((action) => {
        totalDurationLower += action.durationLower;
        totalDurationUpper += action.durationUpper;
        actionCount++;
      });

      //generate report messages
      const newReportItems: ReportItem[] = [];

      // check if no actions
      if (poiActions.length === 0) {
        newReportItems.push({
          message: "POI has no actions",
          type: "warning",
        } as ReportItem);
      }

      const newCalculatedFields: PoiCalculatedFields = {
        uuid: poi.uuid,
        reportItems: newReportItems,
        totalTime: {
          durationLower: totalDurationLower,
          durationUpper: totalDurationUpper,
        },
        actionCount,
      };
      allCalculatedFields.push(newCalculatedFields);
    }
    dispatch(setPoiCalculatedFields({ calculatedFields: allCalculatedFields }));
  }
);
