export const pushToHistory = (
  Table,
  file_id,
  feature_id,
  feature_idRemove,
  time,
  undoToTime,
  action_index,
  successCallback,
  failureCallback
) => {
  Table.findAll({
    limit: 1,
    where: {
      file_id: file_id,
    },
    order: [["history_id", "DESC"]],
  })
    .then((lastHistory) => {
      if (lastHistory && lastHistory.length > 0) {
        return {
          historyIndex: lastHistory[0].history_id + 1,
          history: lastHistory[0].history,
        };
      } else return { historyIndex: 0, history: [] };
    })
    .then((historyObj) => {
      getNextHistory(
        Table,
        historyObj.history,
        action_index,
        feature_id,
        feature_idRemove,
        file_id,
        undoToTime,
        (h) => {
          const newHistoryEntry = {
            file_id: file_id,
            history_id: historyObj.historyIndex,
            time: time,
            action_index: action_index,
            history: h,
          };
          // Insert new entry into the history table
          Table.create(newHistoryEntry)
            .then((_created) => {
              successCallback();
              return null;
            })
            .catch((err) => {
              failureCallback(err);
            });
        },
        (err) => {
          failureCallback(err);
        }
      );
      return null;
    });
};

const getNextHistory = (
  Table,
  history,
  action_index,
  feature_idAdd,
  feature_idRemove,
  file_id,
  undoToTime,
  successCallback,
  failureCallback
) => {
  switch (action_index) {
    case 0: //add
      history.push(feature_idAdd);
      if (Array.isArray(feature_idAdd)) history = feature_idAdd;
      successCallback(history);
      return;
    case 1: //edit
      history.splice(history.indexOf(parseInt(feature_idRemove)), 1);
      history.push(feature_idAdd);
      successCallback(history);
      return;
    case 2: //delete
      history.splice(history.indexOf(parseInt(feature_idRemove)), 1);
      successCallback(history);
      return;
    case 3: //undo
      //Here we do want to use the last history, we want to use the history at undo to time
      Table.findOne({
        where: {
          file_id: file_id,
          time: undoToTime,
        },
      })
        .then((history) => {
          successCallback(history.history);
          return null;
        })
        .catch((err) => {
          failureCallback(err);
          return null;
        });
      break;
    case 5: //Clip add over
    case 6: //Merge add array of add ids and remove array of remove ids
    case 7: //Clip add under
    case 8: //Split
      //add
      history = history.concat(feature_idAdd);
      //remove
      history = uniqueAcrossArrays(history, feature_idRemove);
      successCallback(history);
      return;
    default:
      failureCallback("Unknown action_index: " + action_index);
  }
};

/**
 * Crops out duplicate array elements between arrays
 * Ex.
 *  arr1=['a','b'], arr2=['b'] -> ['a']
 *
 * @param {[]} arr1
 * @param {[]} arr2
 * @return {[]} arr1 without any elements of arr2
 */
const uniqueAcrossArrays = (arr1, arr2) => {
  const uniqueArr = Object.assign([], arr1);
  for (let i = uniqueArr.length - 1; i >= 0; i--) {
    if (arr2.indexOf(arr1[i]) != -1) uniqueArr.splice(i, 1);
  }

  return uniqueArr;
};
