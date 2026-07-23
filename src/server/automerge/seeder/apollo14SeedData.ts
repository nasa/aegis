import { generateBlankAction } from "store/storeUtils/action";
import { generateBlankEVA } from "store/storeUtils/eva";
import { generateBlankMission } from "store/storeUtils/mission";
import { generateBlankPoi } from "store/storeUtils/poi";
import { generateBlankStation } from "store/storeUtils/station";
import { defaultSublayerStyle } from "store/storeUtils/sublayer";
import { generateBlankTraverse } from "store/storeUtils/traverse";

/**
 * Static seed data for the "Apollo 14" demo mission.
 *
 * The geospatial configuration and the traverse/station geometry are lifted from a
 * real lunar DEM so the demo renders realistically on the map. Entity names are
 * generic demo labels and do NOT represent the historical Apollo 14 traverse or
 * sampling sites.
 *
 * The mission `id` and every entity `missionId` are set to a placeholder (1) in this
 * static data. The seed runner ({@link file://./seedApollo14.ts}) stamps the real id
 * onto the mission and every entity at seed time, using the next available id assigned
 * by the `doc_listing` autoincrement — so the demo can be seeded into any database, not
 * just a fresh one.
 *
 * The mission scaffold comes from {@link generateBlankMission} so new Mission fields are
 * picked up automatically; the typed literals below are checked by `tsc` (part of
 * `npm run test:all`), which flags when a schema change needs a touch-up.
 */

const actionDefinitions: ActionDefinitions = {
  adjectives: {
    "0d8c842f-2272-433b-955b-6a8e726f2ca8": {
      abbr: "cb",
      name: "Terrain Type: cb",
    },
    "1b3f4104-db3f-4346-a0c2-620642e3c173": {
      abbr: "psr",
      name: "PSR",
    },
    "616fdad4-2ee7-44a9-bbc5-4ea52994ca5d": {
      abbr: "uh1",
      name: "Terrain Type: uh1",
    },
    "6ad4ff50-d512-4fff-8269-6384970ece7f": {
      abbr: "icwd",
      name: "Terrain Type: icwd",
    },
    "6f7ed266-f277-4fd1-a8b4-5ead93836ff4": {
      abbr: "A",
      name: "Geo Unit: A",
    },
    "7cfe459d-123b-46b4-80f0-f47c55975342": {
      abbr: "distalnder",
      name: "Distal to Lander",
    },
    "99641ec4-800c-4fac-b974-d78b79834c4e": {
      abbr: "ce",
      name: "Terrain Type: ce",
    },
    "9bede51a-7ff8-47c2-ae16-567c29c5221a": {
      abbr: "shadow",
      name: "Shadow",
    },
    "9dbe9a52-1894-472f-8c72-53eaefa494e9": {
      abbr: "C",
      name: "Geo Unit: C",
    },
    "ae988ef8-3da9-45c6-9112-c56ccd9e8b3e": {
      abbr: "proxlander",
      name: "Proximal to Lander",
    },
    "b6523da2-bbdb-4a59-974f-59237a57ef9c": {
      abbr: "icwf",
      name: "Terrain Type: icwf",
    },
    "bcaa2401-60cf-4a5d-9ee5-93e30477ff5d": {
      abbr: "uh2",
      name: "Terrain Type: uh2",
    },
    "f9847814-b89b-4d2d-94ea-631750835d91": {
      abbr: "B",
      name: "Geo Unit: B",
    },
  },
  nouns: {
    "08da47dc-03db-41d7-a128-6196b4d2ce3d": {
      abbr: "geoprops",
      name: "Geotechnical Properties",
    },
    "14b94fed-7992-4764-b866-b147b6844762": {
      abbr: "impactmelt",
      name: "Impact Melt",
    },
    "169c90f2-1413-49b0-82e8-3f8fd37f470a": {
      abbr: "craterflr",
      name: "Crater Floor",
    },
    "4a0db7fc-ca81-4420-8e75-9d2c01cb4f13": {
      abbr: "trenchflr",
      name: "Trench Floor",
    },
    "51d6eba0-5892-43a9-bfbc-dbde82b9798b": {
      abbr: "regdist",
      name: "Regolith (Disturbed)",
    },
    "554c51c3-3beb-4820-a27b-c131608e9e55": {
      abbr: "trenchwall",
      name: "Trench Wall",
    },
    "6979ee91-fc87-4d8f-80ca-4ef6721bb075": {
      abbr: "station",
      name: "Station",
    },
    "6c42e9dd-17ba-4ff3-83dc-194bbf5c30a2": {
      abbr: "regolith",
      name: "Regolith (any)",
    },
    "acc81ccc-e473-4f67-9a2b-a5021370c568": {
      abbr: "boulderfillet",
      name: "Boulder Fillet",
    },
    "b96c47c5-4278-4746-85ad-64493b01e6c0": {
      abbr: "contact",
      name: "Contact",
    },
    "bf87adda-c849-46af-9536-80097a9182aa": {
      abbr: "regundist",
      name: "Regolith (Undisturbed)",
    },
    "c909fefe-ee49-4547-a9dc-092ea6cfe543": {
      abbr: "trench",
      name: "Trench (any)",
    },
    "ceb692fe-0750-4733-afaa-99d09b39ef25": {
      abbr: "boulder",
      name: "Boulder",
    },
    "cf85c6d0-a36d-45b3-8ed5-ab12fd48b842": {
      abbr: "craterrim",
      name: "Crater Rim",
    },
  },
  verbs: {
    "008ac6bd-c604-4e97-8f53-5336bed0c977": {
      abbr: "s-sddtube",
      name: "Sample: Sealed Double Drive Tube",
    },
    "01b7d9e1-3d9d-4f63-80be-690dfeec5d04": {
      abbr: "describe",
      name: "Describe",
    },
    "17e6e6d9-4bad-4a02-8efb-5af3aa1d8661": {
      abbr: "p-stereo",
      name: "Photo: Stereo Pair",
    },
    "2c319f58-5bf6-43c8-afd0-89f33fb12a6f": {
      abbr: "observe",
      name: "Observe",
    },
    "4034a02f-393a-4251-a223-8f84e6c42c12": {
      abbr: "p-mosaic",
      name: "Photo: Mosaic",
    },
    "4ac6a4e1-595f-4cb4-a740-cac81c5c2d3b": {
      abbr: "s-sdtube",
      name: "Sample: Sealed Drive Tube",
    },
    "52029a2a-cc8b-44e9-afc3-171c4225419b": {
      abbr: "charize",
      name: "Characterize",
    },
    "59375d58-fda7-4036-9cb1-2a04abf2bfec": {
      abbr: "trench",
      name: "Trench",
    },
    "651bc0f9-91f7-41d4-8e94-b3b7bec3a4ae": {
      abbr: "s-ddtube",
      name: "Sample: Double Drive Tube",
    },
    "657024db-b8bb-479a-a24c-b371cb34266b": {
      abbr: "p-survey",
      name: "Photo: Photometric Survey",
    },
    "67cb9db1-c5d9-4055-a026-56455c631b61": {
      abbr: "s-sskim",
      name: "Sample: Sealed Skim",
    },
    "68b6a444-056c-4996-b0c7-e97a705a152c": {
      abbr: "s-contact",
      name: "Sample: Contact Sample",
    },
    "73dc7508-de26-4413-bea7-cc37e998d745": {
      abbr: "measure",
      name: "Measure",
    },
    "743e07c1-8199-418b-9341-06f2d6c7ace2": {
      abbr: "s-rake",
      name: "Sample: Rake",
    },
    "900227b1-3973-4f7e-8779-d99bcad9643d": {
      abbr: "p-nested",
      name: "Photo: Nested Image",
    },
    "95a2d308-587b-4cf8-bf4e-b9bd79594b56": {
      abbr: "photo",
      name: "Photo",
    },
    "987d3175-6600-4880-b454-287a3b393fda": {
      abbr: "deploy",
      name: "Deploy",
    },
    "a0520f89-0a0d-4e1d-a8bd-21e4dce19c94": {
      abbr: "s-chip",
      name: "Sample: Chip",
    },
    "a66daa03-dd95-4f77-8e9d-be3645b87af7": {
      abbr: "s-dtube",
      name: "Sample: Drive Tube",
    },
    "ac5178b5-ff9c-4fa3-8b42-cfaff41345c7": {
      abbr: "s-scoop",
      name: "Sample: Scoop",
    },
    "b0644f32-39dc-4cb6-a4ff-89f1a0bd9ba1": {
      abbr: "s-sscoop",
      name: "Sample: Sealed Scoop",
    },
    "b7c56273-26d3-48a6-b7b2-8a1e3b2eefbd": {
      abbr: "s-skim",
      name: "Sample: Skim",
    },
    "e39eeb91-cb5d-41da-a7ff-2c3205124b9e": {
      abbr: "p-stermosc",
      name: "Photo: Stereo Mosaic",
    },
    "e84665cd-adee-4d35-8dee-a15e35f2f8ce": {
      abbr: "s-float",
      name: "Sample: Float",
    },
    "f5a0db36-83ca-49d6-8362-186415adbedd": {
      abbr: "place",
      name: "Place",
    },
    "f6117de9-cf9a-410e-a91a-357ae43a2949": {
      abbr: "p-pano",
      name: "Photo: 360 Panorama",
    },
  },
};

const pois: { [uuid: string]: POI } = {
  "b1a4d0c2-0001-4a01-9a01-000000000001": generateBlankPoi({
    actionOrderUuids: [],
    createdAt: 1700000000000,
    description: "Lunar module landing site.",
    elevation: -1063.605,
    icon: "1F535",
    location: {
      lat: -3.645421873728663,
      lng: -17.47186660766602,
    },
    missionId: 1,
    name: "Landing Site",
    ownerId: 1,
    priorityOverride: 0,
    radius: 5,
    status: "Candidate",
    tags: [],
    updatedAt: 1700000000000,
    uuid: "b1a4d0c2-0001-4a01-9a01-000000000001",
  }),
  "b1a4d0c2-0002-4a02-9a02-000000000002": generateBlankPoi({
    actionOrderUuids: [],
    createdAt: 1700000000000,
    description: "Candidate sampling location.",
    elevation: -965.4056,
    icon: "1F535",
    location: {
      lat: -3.6305321083381985,
      lng: -17.431614774968363,
    },
    missionId: 1,
    name: "Sample Point A",
    ownerId: 1,
    priorityOverride: 0,
    radius: 5,
    status: "Candidate",
    tags: [],
    updatedAt: 1700000000000,
    uuid: "b1a4d0c2-0002-4a02-9a02-000000000002",
  }),
  "b1a4d0c2-0003-4a03-9a03-000000000003": generateBlankPoi({
    actionOrderUuids: [],
    createdAt: 1700000000000,
    description: "Candidate sampling location.",
    elevation: -1072.9459,
    icon: "1F535",
    location: {
      lat: -3.5999043567467957,
      lng: -17.457869905981727,
    },
    missionId: 1,
    name: "Sample Point B",
    ownerId: 1,
    priorityOverride: 0,
    radius: 5,
    status: "Candidate",
    tags: [],
    updatedAt: 1700000000000,
    uuid: "b1a4d0c2-0003-4a03-9a03-000000000003",
  }),
  "b1a4d0c2-0004-4a04-9a04-000000000004": generateBlankPoi({
    actionOrderUuids: [],
    createdAt: 1700000000000,
    description: "Reference survey marker.",
    elevation: -1085.605,
    icon: "1F6A9",
    location: {
      lat: -3.618220864204467,
      lng: -17.49984741210938,
    },
    missionId: 1,
    name: "Survey Marker",
    ownerId: 1,
    priorityOverride: 0,
    radius: 5,
    status: "Candidate",
    tags: [],
    updatedAt: 1700000000000,
    uuid: "b1a4d0c2-0004-4a04-9a04-000000000004",
  }),
};

const stations: { [uuid: string]: Station } = {
  "12f9ea21-f50d-4406-beac-5c0517421b35": generateBlankStation({
    actionOrderUuids: [
      "fef12ca1-66dd-47ac-bfa6-0b0e77a2eea9",
      "071db5a3-4deb-46a7-8dce-433f43a4c78a",
    ],
    createdAt: 1700000000000,
    description: "",
    duration: 25,
    elevation: -965.4056,
    icon: "1f537",
    location: {
      lat: -3.6305321083381985,
      lng: -17.431614774968363,
    },
    mapCircleControls: {},
    missionId: 1,
    name: "Cone Crater",
    ownerId: 1,
    poiUuids: ["b1a4d0c2-0002-4a02-9a02-000000000002"],
    radius: 5,
    refUuid: "9e99f66a-0c92-4ccf-abfe-adab7649ee80",
    status: "Candidate",
    updatedAt: 1700000000000,
    uuid: "12f9ea21-f50d-4406-beac-5c0517421b35",
    walkbackPath: [
      {
        lat: -3.6305321083381985,
        lng: -17.431614774968363,
      },
      {
        lat: -3.645421873728663,
        lng: -17.47186660766602,
      },
    ],
    walkbackPathSegmentDistances: [1299.0970364777975],
    walkbackPathSegmentElevations: [
      [
        -965.4056, -965.831, -967.0574, -968.3084, -969.5439, -970.9428, -972.10565, -973.3681,
        -974.2264, -975.50586, -976.6452, -975.982, -978.38, -980.1387, -981.81616, -983.10254,
        -984.5031, -985.7993, -986.79913, -987.7757, -988.93646, -990.2643, -991.3002, -992.8462,
        -995.02795, -996.33527, -997.90643, -999.6228, -1001.3457, -1002.5035, -1003.92316,
        -1005.787, -1007.10333, -1008.0376, -1009.80035, -1010.95795, -1012.32214, -1013.9967,
        -1016.4039, -1017.4845, -1018.9491, -1020.4237, -1021.54083, -1024.1188, -1025.4303,
        -1027.4409, -1028.9948, -1030.0387, -1031.7007, -1032.9717, -1034.4825, -1035.6361,
        -1037.359, -1038.7338, -1039.949, -1040.6366, -1041.2693, -1042.4381, -1042.9172,
        -1043.4597, -1044.3943, -1045.4803, -1045.8953, -1046.626, -1047.8479, -1048.577,
        -1049.4768, -1050.18, -1051.2191, -1052.1447, -1053.3091, -1054.691, -1055.7687, -1056.4071,
        -1057.2161, -1058.2838, -1058.7247, -1058.7701, -1059.1005, -1059.948, -1060.4974,
        -1061.285, -1061.8219, -1062.0591, -1062.3336, -1062.742, -1062.8734, -1063.1277,
        -1063.3711, -1063.5643, -1063.8175, -1063.9778, -1064.4705, -1064.8395, -1065.1083,
        -1065.4047, -1065.7275, -1065.9431, -1066.2737, -1066.569, -1066.8463, -1067.1918,
        -1067.2784, -1067.5187, -1067.7621, -1067.7502, -1067.5789, -1067.2417, -1067.9314,
        -1066.4385, -1065.3497, -1064.6538, -1064.3578, -1064.0146, -1063.3483, -1062.8793,
        -1062.6257, -1062.2402, -1062.0884, -1062.0754, -1061.9685, -1061.79, -1061.7048, -1061.637,
        -1061.6953, -1061.8915, -1062.1249, -1062.5128, -1063.3347, -1063.605,
      ],
    ],
    walkbackTraverseRate: null,
  }),
  "c1f76e55-8f39-45ee-8080-ab1f604394c7": generateBlankStation({
    actionOrderUuids: [
      "ac3c7ed3-f6d0-4db6-bf1b-e1216da2a500",
      "bbcc42ec-7d96-47da-bac7-fa473a0063f0",
    ],
    createdAt: 1700000000000,
    description: "",
    duration: 25,
    elevation: -1072.9459,
    icon: "1f536",
    location: {
      lat: -3.5999043567467957,
      lng: -17.457869905981727,
    },
    mapCircleControls: {},
    missionId: 1,
    name: "Station 2",
    ownerId: 1,
    poiUuids: ["b1a4d0c2-0003-4a03-9a03-000000000003"],
    radius: 5,
    refUuid: "649732fe-1b19-4e6d-a843-10b96db1e9e1",
    status: "Candidate",
    updatedAt: 1700000000000,
    uuid: "c1f76e55-8f39-45ee-8080-ab1f604394c7",
    walkbackPath: [
      {
        lat: -3.5999043567467957,
        lng: -17.457869905981727,
      },
      {
        lat: -3.645421873728663,
        lng: -17.47186660766602,
      },
    ],
    walkbackPathSegmentDistances: [1443.7767971676924],
    walkbackPathSegmentElevations: [
      [
        -1072.9459, -1073.5865, -1072.6791, -1072.0825, -1071.7914, -1071.5736, -1071.0093,
        -1070.2561, -1069.9376, -1069.504, -1069.0242, -1068.5686, -1069.0377, -1069.4648,
        -1069.6414, -1070.2625, -1070.7676, -1071.2898, -1071.57, -1071.8107, -1072.149, -1072.9199,
        -1073.7185, -1074.654, -1075.8453, -1077.1416, -1078.498, -1079.8793, -1081.2378,
        -1082.6544, -1084.0717, -1085.9426, -1087.2673, -1089.1177, -1090.6049, -1091.3794,
        -1092.6124, -1093.2618, -1093.9384, -1094.1392, -1094.5586, -1094.3114, -1094.2803,
        -1094.2236, -1094.045, -1093.4357, -1092.9523, -1092.3224, -1091.5106, -1090.3857,
        -1088.9913, -1087.974, -1086.2025, -1084.1515, -1082.0829, -1080.2151, -1078.6134,
        -1076.7505, -1075.4288, -1074.2644, -1073.0239, -1072.2509, -1071.3335, -1070.8483,
        -1069.7714, -1068.4269, -1067.6818, -1067.2533, -1067.0305, -1066.424, -1066.0302,
        -1065.6361, -1065.5126, -1065.5317, -1065.3495, -1065.2405, -1065.0771, -1064.8942,
        -1064.6196, -1064.5808, -1064.4723, -1064.4354, -1064.3354, -1064.294, -1064.1559,
        -1064.2429, -1064.4951, -1064.9135, -1064.9711, -1065.067, -1065.4242, -1065.9249,
        -1066.4025, -1067.1119, -1067.6462, -1068.5371, -1069.5481, -1070.6921, -1071.617,
        -1073.0002, -1074.0205, -1075.4724, -1076.6567, -1077.2234, -1078.132, -1079.0801,
        -1080.3334, -1080.9425, -1081.0754, -1081.4535, -1082.114, -1082.8732, -1083.0209,
        -1083.0562, -1083.1882, -1082.0077, -1080.7036, -1079.4838, -1078.2787, -1077.117,
        -1075.6914, -1074.1942, -1072.8539, -1071.3407, -1070.3124, -1068.7946, -1067.7063,
        -1066.8434, -1065.6211, -1064.8937, -1063.9287, -1062.8738, -1062.5388, -1062.1345,
        -1061.9222, -1061.6263, -1061.5398, -1061.4604, -1061.7692, -1061.9075, -1062.2307,
        -1062.5543, -1062.9452, -1063.171, -1063.605,
      ],
    ],
    walkbackTraverseRate: null,
  }),
};

const traverses: { [uuid: string]: Traverse } = {
  "5f96866a-e8b5-4fa1-9451-b58b18fa2e49": generateBlankTraverse({
    actionOrderUuids: [],
    color: null,
    createdAt: 1700000000000,
    description: "",
    duration: null,
    missionId: 1,
    name: "Lander to Cone Crater",
    path: [
      {
        lat: -3.645421873728663,
        lng: -17.47186660766602,
      },
      {
        lat: -3.6305321083381985,
        lng: -17.431614774968363,
      },
    ],
    pathSegmentDistances: [1299.0970364777975],
    pathSegmentElevations: [
      [
        -1063.605, -1063.3347, -1062.5128, -1062.1249, -1061.8915, -1061.6953, -1061.637,
        -1061.7048, -1061.79, -1061.9685, -1062.0754, -1062.0884, -1062.2402, -1062.6257,
        -1062.8793, -1063.3483, -1064.0146, -1064.3578, -1064.6538, -1065.3497, -1066.4385,
        -1067.9314, -1067.2417, -1067.5789, -1067.7502, -1067.7621, -1067.5187, -1067.2784,
        -1067.1918, -1066.8463, -1066.569, -1066.2737, -1065.9431, -1065.7275, -1065.4047,
        -1065.1083, -1064.8395, -1064.4705, -1063.9778, -1063.8175, -1063.5643, -1063.3711,
        -1063.1277, -1062.8734, -1062.742, -1062.3336, -1062.0591, -1061.8219, -1061.285,
        -1060.4974, -1059.948, -1059.1005, -1058.7701, -1058.7247, -1058.2838, -1057.2161,
        -1056.4071, -1055.7687, -1054.691, -1053.3091, -1052.1447, -1051.2191, -1050.18, -1049.4768,
        -1048.577, -1047.8479, -1046.626, -1045.8953, -1045.4803, -1044.3943, -1043.4597,
        -1042.9172, -1042.4381, -1041.2693, -1040.6366, -1039.949, -1038.7338, -1037.359,
        -1035.6361, -1034.4825, -1032.9717, -1031.7007, -1030.0387, -1028.9948, -1027.4409,
        -1025.4303, -1024.1188, -1021.54083, -1020.4237, -1018.9491, -1017.4845, -1016.4039,
        -1013.9967, -1012.32214, -1010.95795, -1009.80035, -1008.0376, -1007.10333, -1005.787,
        -1003.92316, -1002.5035, -1001.3457, -999.6228, -997.90643, -996.33527, -995.02795,
        -992.8462, -991.3002, -990.2643, -988.93646, -987.7757, -986.79913, -985.7993, -984.5031,
        -983.10254, -981.81616, -980.1387, -978.38, -975.982, -976.6452, -975.50586, -974.2264,
        -973.3681, -972.10565, -970.9428, -969.5439, -968.3084, -967.0574, -965.831, -965.4056,
      ],
    ],
    refUuid: "534ffe4d-e777-47a2-a83d-f6efcec20b92",
    status: null,
    updatedAt: 1700000000000,
    uuid: "5f96866a-e8b5-4fa1-9451-b58b18fa2e49",
  }),
  "7b12776f-9e1c-4d5a-926e-76e7e335f3a1": generateBlankTraverse({
    actionOrderUuids: [],
    color: null,
    createdAt: 1700000000000,
    description: "",
    duration: null,
    missionId: 1,
    name: "Cone Crater to Station 2",
    path: [
      {
        lat: -3.6305321083381985,
        lng: -17.431614774968363,
      },
      {
        lat: -3.5999043567467957,
        lng: -17.457869905981727,
      },
    ],
    pathSegmentDistances: [1222.2417872113458],
    pathSegmentElevations: [
      [
        -965.4056, -965.1518, -965.7493, -967.9056, -971.4365, -975.9124, -980.18585, -984.7737,
        -989.36017, -994.13806, -997.22675, -1000.7015, -1004.57996, -1008.1278, -1011.78033,
        -1014.8779, -1015.90485, -1017.4665, -1018.64655, -1020.2594, -1019.05444, -1018.70844,
        -1018.2755, -1017.1626, -1012.99603, -1011.8927, -1010.135, -1009.12115, -1007.4078,
        -1006.7004, -1006.7969, -1007.727, -1009.14264, -1011.70624, -1013.96515, -1016.4566,
        -1019.2513, -1021.0068, -1022.68005, -1024.5781, -1027.203, -1029.4467, -1031.494,
        -1033.0101, -1035.8828, -1037.7142, -1039.1372, -1041.0161, -1042.4379, -1044.1099,
        -1045.7363, -1047.8179, -1049.294, -1050.4492, -1051.4644, -1052.3999, -1053.1644,
        -1053.8934, -1054.3107, -1055.2102, -1055.8395, -1056.3969, -1057.3622, -1058.3402,
        -1058.4438, -1058.7616, -1059.2976, -1059.4772, -1059.9999, -1060.5974, -1061.0115,
        -1061.5543, -1061.7423, -1062.0052, -1062.3314, -1062.8875, -1063.203, -1063.4838,
        -1064.313, -1064.5792, -1065.0464, -1065.5985, -1066.0062, -1066.6694, -1067.4663,
        -1068.0472, -1068.7716, -1069.4081, -1069.7358, -1070.1782, -1070.4779, -1070.5508,
        -1070.5248, -1070.4954, -1070.836, -1071.4169, -1071.8109, -1071.7272, -1071.6014,
        -1071.5728, -1071.4238, -1071.2378, -1070.9962, -1070.7953, -1069.8484, -1069.2885,
        -1068.9414, -1068.7667, -1068.5024, -1068.2861, -1068.4827, -1068.6837, -1069.0066,
        -1069.6016, -1070.2554, -1070.7393, -1071.0848, -1071.197, -1071.9374, -1073.8109,
        -1076.841, -1074.2911, -1072.9459,
      ],
    ],
    refUuid: "3cf5094b-fa40-4d71-b49b-d7094fcb3b2b",
    status: null,
    updatedAt: 1700000000000,
    uuid: "7b12776f-9e1c-4d5a-926e-76e7e335f3a1",
  }),
  "b0939224-fc3d-48d8-bacd-e8513a7b9ffc": generateBlankTraverse({
    actionOrderUuids: [],
    color: null,
    createdAt: 1700000000000,
    description: "",
    duration: null,
    missionId: 1,
    name: "Station 2 to Lander",
    path: [
      {
        lat: -3.5999043567467957,
        lng: -17.457869905981727,
      },
      {
        lat: -3.645421873728663,
        lng: -17.47186660766602,
      },
    ],
    pathSegmentDistances: [1443.7767971676924],
    pathSegmentElevations: [
      [
        -1072.9459, -1073.5865, -1072.6791, -1072.0825, -1071.7914, -1071.5736, -1071.0093,
        -1070.2561, -1069.9376, -1069.504, -1069.0242, -1068.5686, -1069.0377, -1069.4648,
        -1069.6414, -1070.2625, -1070.7676, -1071.2898, -1071.57, -1071.8107, -1072.149, -1072.9199,
        -1073.7185, -1074.654, -1075.8453, -1077.1416, -1078.498, -1079.8793, -1081.2378,
        -1082.6544, -1084.0717, -1085.9426, -1087.2673, -1089.1177, -1090.6049, -1091.3794,
        -1092.6124, -1093.2618, -1093.9384, -1094.1392, -1094.5586, -1094.3114, -1094.2803,
        -1094.2236, -1094.045, -1093.4357, -1092.9523, -1092.3224, -1091.5106, -1090.3857,
        -1088.9913, -1087.974, -1086.2025, -1084.1515, -1082.0829, -1080.2151, -1078.6134,
        -1076.7505, -1075.4288, -1074.2644, -1073.0239, -1072.2509, -1071.3335, -1070.8483,
        -1069.7714, -1068.4269, -1067.6818, -1067.2533, -1067.0305, -1066.424, -1066.0302,
        -1065.6361, -1065.5126, -1065.5317, -1065.3495, -1065.2405, -1065.0771, -1064.8942,
        -1064.6196, -1064.5808, -1064.4723, -1064.4354, -1064.3354, -1064.294, -1064.1559,
        -1064.2429, -1064.4951, -1064.9135, -1064.9711, -1065.067, -1065.4242, -1065.9249,
        -1066.4025, -1067.1119, -1067.6462, -1068.5371, -1069.5481, -1070.6921, -1071.617,
        -1073.0002, -1074.0205, -1075.4724, -1076.6567, -1077.2234, -1078.132, -1079.0801,
        -1080.3334, -1080.9425, -1081.0754, -1081.4535, -1082.114, -1082.8732, -1083.0209,
        -1083.0562, -1083.1882, -1082.0077, -1080.7036, -1079.4838, -1078.2787, -1077.117,
        -1075.6914, -1074.1942, -1072.8539, -1071.3407, -1070.3124, -1068.7946, -1067.7063,
        -1066.8434, -1065.6211, -1064.8937, -1063.9287, -1062.8738, -1062.5388, -1062.1345,
        -1061.9222, -1061.6263, -1061.5398, -1061.4604, -1061.7692, -1061.9075, -1062.2307,
        -1062.5543, -1062.9452, -1063.171, -1063.605,
      ],
    ],
    refUuid: "08f35867-fa34-44d1-9e5b-d35aed8eda20",
    status: null,
    updatedAt: 1700000000000,
    uuid: "b0939224-fc3d-48d8-bacd-e8513a7b9ffc",
  }),
};

const actions: { [uuid: string]: Action } = {
  "071db5a3-4deb-46a7-8dce-433f43a4c78a": generateBlankAction({
    actionDefinition: {
      adjectiveUuid: "9bede51a-7ff8-47c2-ae16-567c29c5221a",
      nounUuid: "ceb692fe-0750-4733-afaa-99d09b39ef25",
      verbUuid: "a0520f89-0a0d-4e1d-a8bd-21e4dce19c94",
    },
    createdAt: 1700000000000,
    crewAssigned: ["EV2"],
    description: "",
    descriptionTask: "",
    duration: 6,
    elevation: null,
    enabled: true,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    icon: "26cf-fe0f",
    location: null,
    mass: null,
    missionId: 1,
    name: "Dax",
    parentActionUuid: null,
    parentCopyDate: null,
    poiUuid: null,
    priority: null,
    refUuid: "f553091f-0164-4f7e-9628-75a71894343e",
    stationUuid: "12f9ea21-f50d-4406-beac-5c0517421b35",
    status: "Candidate",
    stmAction: true,
    stmPriorities: null,
    traverseUuid: null,
    type: "other",
    updatedAt: 1700000000000,
    uuid: "071db5a3-4deb-46a7-8dce-433f43a4c78a",
  }),
  "ac3c7ed3-f6d0-4db6-bf1b-e1216da2a500": generateBlankAction({
    actionDefinition: {
      adjectiveUuid: "1b3f4104-db3f-4346-a0c2-620642e3c173",
      nounUuid: "b96c47c5-4278-4746-85ad-64493b01e6c0",
      verbUuid: "59375d58-fda7-4036-9cb1-2a04abf2bfec",
    },
    createdAt: 1700000000000,
    crewAssigned: ["EV1"],
    description: "",
    descriptionTask: "",
    duration: 6,
    elevation: null,
    enabled: true,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    icon: "26cf-fe0f",
    location: null,
    mass: null,
    missionId: 1,
    name: "Paris",
    parentActionUuid: null,
    parentCopyDate: null,
    poiUuid: null,
    priority: null,
    refUuid: "f4d5000d-6210-49ae-b050-4416eaafc789",
    stationUuid: "c1f76e55-8f39-45ee-8080-ab1f604394c7",
    status: "Candidate",
    stmAction: true,
    stmPriorities: null,
    traverseUuid: null,
    type: "other",
    updatedAt: 1700000000000,
    uuid: "ac3c7ed3-f6d0-4db6-bf1b-e1216da2a500",
  }),
  "bbcc42ec-7d96-47da-bac7-fa473a0063f0": generateBlankAction({
    actionDefinition: {
      adjectiveUuid: "99641ec4-800c-4fac-b974-d78b79834c4e",
      nounUuid: "51d6eba0-5892-43a9-bfbc-dbde82b9798b",
      verbUuid: "01b7d9e1-3d9d-4f63-80be-690dfeec5d04",
    },
    createdAt: 1700000000000,
    crewAssigned: ["EV2"],
    description: "",
    descriptionTask: "",
    duration: 6,
    elevation: null,
    enabled: true,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    icon: "26cf-fe0f",
    location: null,
    mass: null,
    missionId: 1,
    name: "Delta Flyer",
    parentActionUuid: null,
    parentCopyDate: null,
    poiUuid: null,
    priority: null,
    refUuid: "f48a1b42-3ce1-4d00-a762-ea4df1330371",
    stationUuid: "c1f76e55-8f39-45ee-8080-ab1f604394c7",
    status: "Candidate",
    stmAction: true,
    stmPriorities: null,
    traverseUuid: null,
    type: "other",
    updatedAt: 1700000000000,
    uuid: "bbcc42ec-7d96-47da-bac7-fa473a0063f0",
  }),
  "fef12ca1-66dd-47ac-bfa6-0b0e77a2eea9": generateBlankAction({
    actionDefinition: {
      adjectiveUuid: "0d8c842f-2272-433b-955b-6a8e726f2ca8",
      nounUuid: "169c90f2-1413-49b0-82e8-3f8fd37f470a",
      verbUuid: "17e6e6d9-4bad-4a02-8efb-5af3aa1d8661",
    },
    createdAt: 1700000000000,
    crewAssigned: ["EV1"],
    description: "",
    descriptionTask: "",
    duration: 6,
    elevation: null,
    enabled: true,
    equipmentItemsUsage: null,
    geographicUnitsUsage: null,
    icon: "26cf-fe0f",
    location: null,
    mass: null,
    missionId: 1,
    name: "Remus",
    parentActionUuid: null,
    parentCopyDate: null,
    poiUuid: null,
    priority: null,
    refUuid: "f3130d91-8a05-405b-a1dc-d77a61870013",
    stationUuid: "12f9ea21-f50d-4406-beac-5c0517421b35",
    status: "Candidate",
    stmAction: true,
    stmPriorities: null,
    traverseUuid: null,
    type: "other",
    updatedAt: 1700000000000,
    uuid: "fef12ca1-66dd-47ac-bfa6-0b0e77a2eea9",
  }),
};

const evas: { [uuid: string]: Eva } = {
  "469d97d4-dbdb-4865-b952-0af9e497a324": generateBlankEVA({
    createdAt: 1700000000000,
    datetime: null,
    description: "",
    duration: 240,
    egressDuration: 10,
    egressLocationUuid: "lander",
    ingressDuration: 10,
    ingressLocationUuid: "lander",
    missionId: 1,
    name: "Aqua",
    ownerId: 1,
    refUuid: "f66f9899-d180-4843-a3bf-f4ce9d03ea2e",
    sequence: [
      {
        type: "traverse",
        uuid: "5f96866a-e8b5-4fa1-9451-b58b18fa2e49",
      },
      {
        type: "station",
        uuid: "12f9ea21-f50d-4406-beac-5c0517421b35",
      },
      {
        type: "traverse",
        uuid: "7b12776f-9e1c-4d5a-926e-76e7e335f3a1",
      },
      {
        type: "station",
        uuid: "c1f76e55-8f39-45ee-8080-ab1f604394c7",
      },
      {
        type: "traverse",
        uuid: "b0939224-fc3d-48d8-bacd-e8513a7b9ffc",
      },
    ],
    status: "Candidate",
    traverseColor: null,
    traverseRate: 2,
    updatedAt: 1700000000000,
    uuid: "469d97d4-dbdb-4865-b952-0af9e497a324",
  }),
};

/**
 * Static Science Traceability Matrix for the demo mission. Lifted from a real
 * test-environment dump. Every level1 entry carries a placeholder missionId (1); the
 * seed runner overrides it with the mission's assigned id at seed time (see the
 * file-level docstring above). The hierarchy is:
 *   Level1 (Goal) -> Level2 (Objective) -> Level3 (Investigation)
 *
 * These are seeded straight to the DB by {@link file://./seedApollo14.ts}
 * (STM is not part of the Mission Automerge document).
 */
export const apollo14StmLevel1s: STMLevel1[] = Object.values({
  "c25a9f75-8077-4651-a4e0-342263b5da6e": {
    uuid: "c25a9f75-8077-4651-a4e0-342263b5da6e",
    numbering: "1",
    name: "Understanding Planetary Processes",
    missionId: 1,
  },
  "d81f6f60-2840-4807-80d4-36acdb932a2d": {
    uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
    numbering: "2",
    name: "Understanding Character and Origin of Lunar Polar Volatiles",
    missionId: 1,
  },
  "643c5fe2-2d92-4d71-8cdd-703a9463c265": {
    uuid: "643c5fe2-2d92-4d71-8cdd-703a9463c265",
    numbering: "3",
    name: "Interpreting the Impact History of the Earth-Moon System",
    missionId: 1,
  },
  "70e521d8-9d33-49e8-ad65-11e26defda5b": {
    uuid: "70e521d8-9d33-49e8-ad65-11e26defda5b",
    numbering: "5",
    name: "Observing the Universe and Local Space Environment from a Unique Location",
    missionId: 1,
  },
  "c6febf7f-c9b0-43d9-9817-41743adedd93": {
    uuid: "c6febf7f-c9b0-43d9-9817-41743adedd93",
    numbering: "7",
    name: "Investigating and Mitigating Exploration Risks",
    missionId: 1,
  },
});

export const apollo14StmLevel2s: STMLevel2[] = Object.values({
  "5d4e82fd-2d37-418c-b161-b8680833a04d": {
    uuid: "5d4e82fd-2d37-418c-b161-b8680833a04d",
    numbering: "a",
    name: "Formation of the Earth-Moon System",
    level1Uuid: "c25a9f75-8077-4651-a4e0-342263b5da6e",
  },
  "73e6a936-464e-412c-bd01-b320fa54c18f": {
    uuid: "73e6a936-464e-412c-bd01-b320fa54c18f",
    numbering: "b",
    name: "Differentiation: Magma Oceans, Crust, and Mantle",
    level1Uuid: "c25a9f75-8077-4651-a4e0-342263b5da6e",
  },
  "4179b56a-65ff-4fbe-b3b6-f34dafb73624": {
    uuid: "4179b56a-65ff-4fbe-b3b6-f34dafb73624",
    numbering: "f",
    name: "The Moon is a Natural Laboratory for Regolith Processes and Weathering on Anhydrous Bodies",
    level1Uuid: "c25a9f75-8077-4651-a4e0-342263b5da6e",
  },
  "be826912-0a3a-4502-bd4e-09a6550abc01": {
    uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
    numbering: "a",
    name: "Determine the Compositional state (elemental, isotopic, mineralogic) and compositional distribution (lateral and with depth) of the volatile component",
    level1Uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
  },
  "cab8f512-176c-4886-ba1f-44ba256cff00": {
    uuid: "cab8f512-176c-4886-ba1f-44ba256cff00",
    numbering: "b",
    name: "Determine the source(s) for lunar polar volatile deposits",
    level1Uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
  },
  "fdb18982-da50-4630-a4f2-f0fed48f9df2": {
    uuid: "fdb18982-da50-4630-a4f2-f0fed48f9df2",
    numbering: "c",
    name: "Understand the transport, retention, alteration, and loss processes that operate on volatile materials at permanently shaded lunar regions",
    level1Uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
  },
  "3630fbed-4857-4d18-9b17-f4a9aa170cbb": {
    uuid: "3630fbed-4857-4d18-9b17-f4a9aa170cbb",
    numbering: "d",
    name: "Understand regolith modification processes (including space weathering), particularly deposition of volatile materials in the near surface",
    level1Uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
  },
  "f451ca8b-de4a-42af-918d-0212a7b03234": {
    uuid: "f451ca8b-de4a-42af-918d-0212a7b03234",
    numbering: "f",
    name: "Understand the impact of human exploration on the lunar volatile record across the surface",
    level1Uuid: "d81f6f60-2840-4807-80d4-36acdb932a2d",
  },
  "fcc8ba12-33d1-4c74-9a46-0e6b38ea95f3": {
    uuid: "fcc8ba12-33d1-4c74-9a46-0e6b38ea95f3",
    numbering: "a",
    name: "Test the Cataclysm",
    level1Uuid: "643c5fe2-2d92-4d71-8cdd-703a9463c265",
  },
  "c2db032a-5331-4009-9776-eb7107d9bad8": {
    uuid: "c2db032a-5331-4009-9776-eb7107d9bad8",
    numbering: "b",
    name: "Understand changes to the Earth-Moon bombardment rate",
    level1Uuid: "643c5fe2-2d92-4d71-8cdd-703a9463c265",
  },
  "8dec2c41-4d71-44e8-9970-b7596480d41a": {
    uuid: "8dec2c41-4d71-44e8-9970-b7596480d41a",
    numbering: "c",
    name: "Understand the impact history of the landing site",
    level1Uuid: "643c5fe2-2d92-4d71-8cdd-703a9463c265",
  },
  "67838ad6-71b9-47ac-a0e8-6973652ed6ed": {
    uuid: "67838ad6-71b9-47ac-a0e8-6973652ed6ed",
    numbering: "b",
    name: "Heliophysical Investigations using the Moon",
    level1Uuid: "70e521d8-9d33-49e8-ad65-11e26defda5b",
  },
  "9428163e-dfcc-43fe-9ce6-52da45919dc4": {
    uuid: "9428163e-dfcc-43fe-9ce6-52da45919dc4",
    numbering: "k",
    name: "Understand lunar dust behavior, particularly dust dynamics",
    level1Uuid: "c6febf7f-c9b0-43d9-9817-41743adedd93",
  },
  "db3b5b09-0016-498a-9321-93c15b457566": {
    uuid: "db3b5b09-0016-498a-9321-93c15b457566",
    numbering: "l",
    name: "Understand lunar electrodynamics",
    level1Uuid: "c6febf7f-c9b0-43d9-9817-41743adedd93",
  },
  "3b661d8e-f13f-4b0f-a427-afff86271a8e": {
    uuid: "3b661d8e-f13f-4b0f-a427-afff86271a8e",
    numbering: "m",
    name: "Monitor real-time environmental variables affecting safe operations, which includes monitoring for meteors, micrometeors, and other space debris that could potentially impact the lunar surface",
    level1Uuid: "c6febf7f-c9b0-43d9-9817-41743adedd93",
  },
});

export const apollo14StmLevel3s: STMLevel3[] = Object.values({
  "e3c9cc9b-f712-4fb9-93ee-a2c3561e7d23": {
    uuid: "e3c9cc9b-f712-4fb9-93ee-a2c3561e7d23",
    numbering: "1",
    name: "Establish the mechanisms, timing, and extent of volatile depletion in the Moon",
    level2Uuid: "5d4e82fd-2d37-418c-b161-b8680833a04d",
  },
  "f050b96d-2095-447a-904d-817a6b331057": {
    uuid: "f050b96d-2095-447a-904d-817a6b331057",
    numbering: "2",
    name: "Constrain the physicochemical conditions and processes that operated at the surface of the lunar magma ocean",
    level2Uuid: "5d4e82fd-2d37-418c-b161-b8680833a04d",
  },
  "45f63b01-738a-4049-9930-7f6043dbf67f": {
    uuid: "45f63b01-738a-4049-9930-7f6043dbf67f",
    numbering: "3",
    name: "Understand the size, chemical makeup, and timing of core formation",
    level2Uuid: "5d4e82fd-2d37-418c-b161-b8680833a04d",
  },
  "8a5f3a47-42bd-4d9f-9ce7-d39e1c74c1f1": {
    uuid: "8a5f3a47-42bd-4d9f-9ce7-d39e1c74c1f1",
    numbering: "1",
    name: "Determine the extent and composition of the primary feldspathic crust, KREEP layer, and other products of planetary differentiation",
    level2Uuid: "73e6a936-464e-412c-bd01-b320fa54c18f",
  },
  "d1fc30c9-83f0-4dd3-bd81-d0ed25598b9a": {
    uuid: "d1fc30c9-83f0-4dd3-bd81-d0ed25598b9a",
    numbering: "2",
    name: "Determine the bulk composition of the crust and mantle",
    level2Uuid: "73e6a936-464e-412c-bd01-b320fa54c18f",
  },
  "4ffdba0e-6763-49fa-b467-f3b562c85823": {
    uuid: "4ffdba0e-6763-49fa-b467-f3b562c85823",
    numbering: "3",
    name: "Inventory, relationships, and ages of nonmare rocks.",
    level2Uuid: "73e6a936-464e-412c-bd01-b320fa54c18f",
  },
  "f6ae009e-6633-47cc-81cb-fa32998b512f": {
    uuid: "f6ae009e-6633-47cc-81cb-fa32998b512f",
    numbering: "1",
    name: "Determine physical properties of regolith at diverse locations of expected human activity",
    level2Uuid: "4179b56a-65ff-4fbe-b3b6-f34dafb73624",
  },
  "cd04e3b3-6e14-4380-b02e-ac17a49b9882": {
    uuid: "cd04e3b3-6e14-4380-b02e-ac17a49b9882",
    numbering: "1",
    name: "Identification of surface frost composition",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "a8493a94-6247-4b15-8b45-57c0232185a1": {
    uuid: "a8493a94-6247-4b15-8b45-57c0232185a1",
    numbering: "2",
    name: "Identification of surface frost locations in spatial context",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "6420c80b-f21d-4e7b-a322-26b58dd86641": {
    uuid: "6420c80b-f21d-4e7b-a322-26b58dd86641",
    numbering: "3",
    name: "Temporal variability of frost",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "5b91e832-371b-4ff2-b8a1-0a5cd316d616": {
    uuid: "5b91e832-371b-4ff2-b8a1-0a5cd316d616",
    numbering: "4",
    name: "Speciation of surface hydrogen",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "c295cb78-4934-4f27-bd00-58eb8d4f43fb": {
    uuid: "c295cb78-4934-4f27-bd00-58eb8d4f43fb",
    numbering: "5",
    name: "Understand surface hydrogen speciation spatial variability",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "7e658a4d-0234-46a9-bedf-72b58398e6fb": {
    uuid: "7e658a4d-0234-46a9-bedf-72b58398e6fb",
    numbering: "6",
    name: "Spatial distribution of subsurface hydrogen",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "4c96c581-9808-49e1-a119-dd9c52f596c7": {
    uuid: "4c96c581-9808-49e1-a119-dd9c52f596c7",
    numbering: "7",
    name: "Determine distribution of micro cold traps across lunar surface within illuminated regions",
    level2Uuid: "be826912-0a3a-4502-bd4e-09a6550abc01",
  },
  "eb63647d-69bf-42b0-848b-6accfef8c0af": {
    uuid: "eb63647d-69bf-42b0-848b-6accfef8c0af",
    numbering: "1",
    name: "Origin of the polar volatiles",
    level2Uuid: "cab8f512-176c-4886-ba1f-44ba256cff00",
  },
  "fab55a0d-a68b-4626-9297-38eec6f5139d": {
    uuid: "fab55a0d-a68b-4626-9297-38eec6f5139d",
    numbering: "1",
    name: "Distribution of water/OH within a PSR",
    level2Uuid: "fdb18982-da50-4630-a4f2-f0fed48f9df2",
  },
  "9f4f512a-62aa-483c-ad40-3a15eb7df867": {
    uuid: "9f4f512a-62aa-483c-ad40-3a15eb7df867",
    numbering: "2",
    name: "Subsurface temperatures",
    level2Uuid: "fdb18982-da50-4630-a4f2-f0fed48f9df2",
  },
  "32aaae67-6447-4026-b5a0-dfaf43cf1aeb": {
    uuid: "32aaae67-6447-4026-b5a0-dfaf43cf1aeb",
    numbering: "3",
    name: "Determine the compositional/physical properties of H-bearing species of the regolith as a function of time",
    level2Uuid: "fdb18982-da50-4630-a4f2-f0fed48f9df2",
  },
  "9d4ba324-2944-4bca-9b82-183af23d1973": {
    uuid: "9d4ba324-2944-4bca-9b82-183af23d1973",
    numbering: "1",
    name: "Speciation of surface hydrogen",
    level2Uuid: "3630fbed-4857-4d18-9b17-f4a9aa170cbb",
  },
  "fb03bcfd-6db4-44e0-bc91-f342ae368cc2": {
    uuid: "fb03bcfd-6db4-44e0-bc91-f342ae368cc2",
    numbering: "1",
    name: "Identify exploration-induced variations on volatile composition, form, and distribution on the lunar surface during sample collection and transport, during curation and analysis, and from landed activities",
    level2Uuid: "f451ca8b-de4a-42af-918d-0212a7b03234",
  },
  "514bfc59-ff0e-4f9a-9191-57b9e31e4869": {
    uuid: "514bfc59-ff0e-4f9a-9191-57b9e31e4869",
    numbering: "1",
    name: "Identify impact melt, impact ejecta, and exogenous (impactor) material in lunar samples to address the hypothesized Lunar Cataclysm",
    level2Uuid: "fcc8ba12-33d1-4c74-9a46-0e6b38ea95f3",
  },
  "cc194e75-b85c-4d2a-afe6-9bad9913760d": {
    uuid: "cc194e75-b85c-4d2a-afe6-9bad9913760d",
    numbering: "1",
    name: "Refine the post-basin impact flux, including up to the present",
    level2Uuid: "c2db032a-5331-4009-9776-eb7107d9bad8",
  },
  "afa76b13-43a1-4a88-991d-3cc73d9ed065": {
    uuid: "afa76b13-43a1-4a88-991d-3cc73d9ed065",
    numbering: "1",
    name: "Determine the sequence of individual craters and basins that influence local, regional, and global stratigraphy at the Artemis III landing site",
    level2Uuid: "8dec2c41-4d71-44e8-9970-b7596480d41a",
  },
  "9bf437ea-2e29-4df6-a4f7-f45527573968": {
    uuid: "9bf437ea-2e29-4df6-a4f7-f45527573968",
    numbering: "1",
    name: "Near-Lunar Electromagnetic and Plasma Environment",
    level2Uuid: "67838ad6-71b9-47ac-a0e8-6973652ed6ed",
  },
  "f8606ab7-f0d5-4744-aa73-40258894de11": {
    uuid: "f8606ab7-f0d5-4744-aa73-40258894de11",
    numbering: "1",
    name: "Understand the properties of electrostatic lofting and levitation, and the role of electrical charging of the dust in the granular behavior of lunar regolih (see science goal 6g)",
    level2Uuid: "9428163e-dfcc-43fe-9ce6-52da45919dc4",
  },
  "da6e1a1a-7862-4874-be24-9e0dda80c02f": {
    uuid: "da6e1a1a-7862-4874-be24-9e0dda80c02f",
    numbering: "2",
    name: "Dust-Plasma Interaction on the Surface & Exosphere of the Moon",
    level2Uuid: "9428163e-dfcc-43fe-9ce6-52da45919dc4",
  },
  "fd95ad6e-9000-4d75-9724-a2e53e8f9047": {
    uuid: "fd95ad6e-9000-4d75-9724-a2e53e8f9047",
    numbering: "1",
    name: "Understand the plasma properties near the lunar surface and how they respond to external drivers, particularly across the terminator",
    level2Uuid: "db3b5b09-0016-498a-9321-93c15b457566",
  },
  "4da435d2-287c-4780-b530-ee934257d556": {
    uuid: "4da435d2-287c-4780-b530-ee934257d556",
    numbering: "2",
    name: "Understand the origin of lunar surface potentials, how they evolve between sunlit and shadowed regions, and under what circumstances they pose a threat to exploration",
    level2Uuid: "db3b5b09-0016-498a-9321-93c15b457566",
  },
  "a1a76159-8dd5-44d5-8d06-02c9aa8dce5c": {
    uuid: "a1a76159-8dd5-44d5-8d06-02c9aa8dce5c",
    numbering: "1",
    name: "Establish a lunar environmental monitoring station to measure environmental variables such as temperature, vibration, dust collection, radiation, seismic activity, and gravity",
    level2Uuid: "3b661d8e-f13f-4b0f-a427-afff86271a8e",
  },
  "d4a76d02-8510-4529-a19b-9a1a336707dc": {
    uuid: "d4a76d02-8510-4529-a19b-9a1a336707dc",
    numbering: "2",
    name: "Provide real-time environmental information relevant to daily lunar operations",
    level2Uuid: "3b661d8e-f13f-4b0f-a427-afff86271a8e",
  },
});

/**
 * Build the Apollo 14 demo mission document. `id` and entity `missionId`s are set to a
 * placeholder (1); the seed runner stamps the real, next-available id onto the mission
 * and every entity at seed time via {@link stampMissionId}.
 *
 * Returns an independent deep copy each call, so callers (e.g. {@link stampMissionId})
 * can mutate it without touching the shared static seed data.
 */
export const buildApollo14Mission = (): Mission =>
  structuredClone(
    generateBlankMission({
      ...{
        id: 1,
        name: "Apollo 14",
        description:
          "Demo mission seeded for local development. Geometry is representative sample data, not the historical Apollo 14 traverse.",
        usingLGRSCoordinates: false,
        actionSystemVersion: 2,
        landerLocation: {
          lat: -3.645421873728663,
          lng: -17.47186660766602,
        },
        landerElevationMeters: -1063.605,
        planetRadius: 1737400,
        initialZoom: 14,
        traverseRate: 2,
        walkbackRate: 2,
        defaultEvaDuration: 240,
        demFilePath: "Data/NAC_DTM_APOLLO14.TIF",
        demResolution: 10,
        projIsCustom: false,
        projEpsg: "EPSG:3857",
        projProj4String:
          "+proj=merc +a=1737400 +b=1737400 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs",
        projBoundsMinX: -17.528332,
        projBoundsMinY: -3.9129984,
        projBoundsMaxX: -17.38599,
        projBoundsMaxY: -2.9632773,
        projOriginX: -17.528332,
        projOriginY: -3.9129984,
        projResZoomLevel: 8,
        projResUnitsPerPixel: 611.4962,
      },
      actionDefinitions,
      pois,
      stations,
      traverses,
      actions,
      evas,
    })
  );

/**
 * Stamp a mission id onto the mission document and every entity that carries a
 * `missionId`. Called by the seed runner with the id the `doc_listing` table assigned
 * (the next available id), so the demo no longer assumes a specific id. This is an
 * apply-style draft mutator: it is safe to call inside an Automerge `.change()`.
 */
export const stampMissionId = (mission: Mission, missionId: number): void => {
  mission.id = missionId;
  for (const poi of Object.values(mission.pois)) poi.missionId = missionId;
  for (const station of Object.values(mission.stations)) station.missionId = missionId;
  for (const traverse of Object.values(mission.traverses)) traverse.missionId = missionId;
  for (const action of Object.values(mission.actions)) action.missionId = missionId;
  for (const eva of Object.values(mission.evas)) eva.missionId = missionId;
  for (const rex of Object.values(mission.rexes)) rex.missionId = missionId;
};

/**
 * Deterministic uuids for the seeded layer, sublayers, and preset. They are hardcoded
 * (rather than generated at seed time) so the default preset below can reference the
 * sublayers statically. The demo mission is seeded at most once (the runner skips if an
 * "Apollo 14" mission already exists), so these uuids never collide.
 */
const DEMO_LAYER_UUID = "a0000000-0000-4000-9000-00000000000a";
const SUBLAYER_ORTHO_UUID = "a1000000-0000-4000-9000-000000000001";
const SUBLAYER_HILLSHADE_UUID = "a1000000-0000-4000-9000-000000000002";
const SUBLAYER_TRAVERSES_UUID = "a1000000-0000-4000-9000-000000000004";
const PRESET_UUID = "a2000000-0000-4000-9000-000000000001";

/** One sublayer definition. `missionId`/timestamps are assigned at seed time. */
export interface Apollo14SeedSublayer {
  uuid: string;
  name: string;
  type: SublayerType;
  description: string;
  path: string | null;
  tilePattern: string | null;
  tileFormat: string;
  boundingBox: number[] | null;
  minNativeZoom: number | null;
  maxNativeZoom: number | null;
  maxZoom: number | null;
}

/** One header layer and its sublayers. `missionId` is assigned at seed time. */
export interface Apollo14SeedLayer {
  uuid: string;
  name: string;
  sublayers: Apollo14SeedSublayer[];
}

/** A single "Demo Layers" header layer holding every demo sublayer. */
export const apollo14Layers: Apollo14SeedLayer[] = [
  {
    uuid: DEMO_LAYER_UUID,
    name: "Demo Layers",
    sublayers: [
      {
        uuid: SUBLAYER_ORTHO_UUID,
        name: "NAC Ortho 50cm",
        type: "tile",
        description: "",
        path: "NAC_ortho_50cm_1_v4",
        tilePattern: "{z}/{x}/{y}.png",
        tileFormat: "tms",
        boundingBox: [-17.52243003485202, -3.90647227279352, -17.39118427681328, -2.96897224131543],
        minNativeZoom: 8,
        maxNativeZoom: 16,
        maxZoom: 23,
      },
      {
        uuid: SUBLAYER_HILLSHADE_UUID,
        name: "NAC DTM 2m Hillshade",
        type: "tile",
        description: "",
        path: "NAC_DTM_hillshade",
        tilePattern: "{z}/{x}/{y}.png",
        tileFormat: "tms",
        boundingBox: [-17.52838060176, -3.91301487948368, -17.38598936240026, -2.96326094389799],
        minNativeZoom: 8,
        maxNativeZoom: 14,
        maxZoom: 23,
      },
      {
        uuid: SUBLAYER_TRAVERSES_UUID,
        name: "Traverses",
        type: "vector",
        description: "",
        path: "Apollo14Traverse.geojson",
        tilePattern: null,
        tileFormat: "tms",
        boundingBox: null,
        minNativeZoom: null,
        maxNativeZoom: null,
        maxZoom: null,
      },
    ],
  },
];

const sublayerControl = (uuid: string, name: string, visible: boolean): MapSublayerControl => ({
  name,
  sublayerUuid: uuid,
  visible,
  style: { ...defaultSublayerStyle },
});

/**
 * The mission-default map preset. Shows the NAC ortho by default with the other
 * sublayers available but hidden. References the deterministic layer/sublayer uuids
 * above. `missionId`/`createdAt`/`updatedAt` are assigned at seed time.
 */
export const apollo14Preset: Preset = {
  uuid: PRESET_UUID,
  ownerId: 1,
  missionId: 1, // placeholder; the seed runner overrides this with the assigned id
  name: "Map Preset 1",
  description: "",
  missionDefault: true,
  mapSublayerControls: {
    [SUBLAYER_ORTHO_UUID]: sublayerControl(SUBLAYER_ORTHO_UUID, "NAC Ortho 50cm", true),
    [SUBLAYER_HILLSHADE_UUID]: sublayerControl(
      SUBLAYER_HILLSHADE_UUID,
      "NAC DTM 2m Hillshade",
      false
    ),
    [SUBLAYER_TRAVERSES_UUID]: sublayerControl(SUBLAYER_TRAVERSES_UUID, "Traverses", true),
  },
  mapCircleControls: {},
  mapGridControl: null,
  layerOrder: [
    {
      layerUuid: DEMO_LAYER_UUID,
      sublayerUuids: [SUBLAYER_TRAVERSES_UUID, SUBLAYER_ORTHO_UUID, SUBLAYER_HILLSHADE_UUID],
    },
  ],
  sunAzimuth: 0,
  sunEnabled: false,
  earthAzimuth: 0,
  earthEnabled: false,
  earthAsMoon: false,
};
