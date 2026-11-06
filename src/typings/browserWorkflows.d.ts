interface BrowserMissionExport {
  exportMission?: ExportMission;
  evas?: ExportEva[];
  pois?: ExportPOI[];
  stations?: ExportStation[];
  actions?: ExportAction[];
  traverses?: ExportTraverse[];
  rexes?: ExportRex[];
}

interface BrowserJsonDownload<T> {
  name: string;
  data: T;
}
