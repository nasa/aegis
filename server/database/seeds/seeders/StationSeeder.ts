import { Seeder } from "@mikro-orm/seeder";
import { Dictionary, EntityManager } from "@mikro-orm/core";
import { Station } from "../../models/station.model";
import { v4 as uuidv4 } from "uuid";

export class StationSeeder extends Seeder {
  async run(em: EntityManager, context: Dictionary): Promise<void> {
    context.station1 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      // actionOrderUuids: [context.action10.uuid],
      name: "Egress",
      status: "Candidate",
      description: "Egress and activity around lander",
      radius: 5,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      elevation: -1063.605,
      walkbackPath: [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        context.mission1.landerLocation,
      ],
      walkbackPathSegmentDistances: [0],
      walkbackPathSegmentElevations: null,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station2 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      // actionOrderUuids: [context.action5.uuid, context.action6.uuid, context.action7.uuid],
      name: "Snake",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: {
        lat: -3.6305066147358214,
        lng: -17.431578163620266,
      },
      elevation: -965.4056,
      walkbackPath: [
        {
          lat: -3.6305066147358214,
          lng: -17.431578163620266,
        },
        {
          lat: -3.645421873728663,
          lng: -17.47186660766602,
        },
      ],
      walkbackPathSegmentDistances: [1300.4046469713867],
      walkbackPathSegmentElevations: [
        [
          -965.4056, -965.831, -966.58234, -967.87244, -969.5439, -970.8141, -971.73206, -973.16376,
          -973.99414, -975.34064, -976.38513, -975.9743, -977.99536, -979.84753, -982.45105,
          -981.96515, -984.287, -985.53204, -986.6007, -987.6423, -988.7145, -989.7015, -991.0644,
          -992.50134, -994.11005, -996.1066, -997.46185, -999.37274, -1000.53735, -1002.1352,
          -1003.6716, -1005.0351, -1006.5422, -1007.8622, -1009.11707, -1010.53674, -1011.95416,
          -1013.20386, -1015.56396, -1017.13574, -1018.53375, -1019.8516, -1021.1986, -1023.34436,
          -1024.7189, -1026.6829, -1028.4222, -1029.5063, -1031.0142, -1032.3923, -1033.4988,
          -1035.0735, -1036.5238, -1038.2157, -1039.2837, -1040.7717, -1041.0205, -1041.6825,
          -1042.7167, -1043.2921, -1043.699, -1044.6812, -1045.745, -1046.1123, -1047.1653,
          -1048.2737, -1049.1075, -1049.7098, -1050.6191, -1051.6377, -1052.5931, -1053.972,
          -1055.1654, -1055.9592, -1056.6223, -1057.5778, -1058.4684, -1058.6809, -1058.85,
          -1059.5071, -1060.087, -1060.813, -1061.5063, -1061.904, -1062.1499, -1062.4664,
          -1062.7253, -1062.9521, -1063.3226, -1063.3147, -1063.5713, -1063.908, -1064.1855,
          -1064.493, -1064.8563, -1065.3182, -1065.4928, -1065.7358, -1065.986, -1066.3549,
          -1066.6036, -1066.8586, -1067.1918, -1067.3596, -1067.5862, -1067.7261, -1067.7726,
          -1067.552, -1067.2426, -1067.5513, -1066.2205, -1065.2396, -1064.6538, -1064.2473,
          -1063.9631, -1063.3483, -1062.8793, -1062.5104, -1062.2205, -1062.0884, -1062.0754,
          -1061.8469, -1061.79, -1061.7048, -1061.626, -1061.6953, -1061.8915, -1062.1249,
          -1062.5128, -1063.3347, -1063.605,
        ],
      ],
      icon: "1f947",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station3 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      // actionOrderUuids: [context.action8.uuid, context.action9.uuid],
      name: "Possum",
      status: "In Review",
      description: "Test station description",
      radius: 3,
      location: { lat: -3.638316103462144, lng: -17.462511062622074 },
      elevation: -1067.9799,
      walkbackPath: [
        {
          lat: -3.6383181745170283,
          lng: -17.46250696051172,
        },
        context.mission1.landerLocation,
      ],
      walkbackPathSegmentDistances: [355.8469131031603],
      walkbackPathSegmentElevations: [
        [
          -1067.9799, -1067.8219, -1067.9578, -1068.2384, -1068.5552, -1068.7097, -1068.7361,
          -1068.7992, -1068.6921, -1068.6616, -1068.432, -1067.808, -1067.7446, -1067.8163,
          -1067.9877, -1067.936, -1067.4144, -1066.4653, -1065.3516, -1064.5552, -1064.154,
          -1063.752, -1063.1965, -1062.9388, -1062.8177, -1062.7161, -1062.338, -1062.1979,
          -1061.9984, -1061.6566, -1061.9999, -1062.053, -1062.3544, -1062.6967, -1063.324,
          -1063.605,
        ],
      ],
      icon: "1f948",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    context.station4 = em.create(Station, {
      uuid: uuidv4(),
      owner: context.user1.id,
      mission: context.mission1.id,
      // actionOrderUuids: [context.action11.uuid],
      name: "Ingress",
      status: "Candidate",
      description: "Cleanup and ingress",
      radius: 5,
      location: { lat: -3.645421873728663, lng: -17.47186660766602 },
      walkbackPath: [
        { lat: -3.645421873728663, lng: -17.47186660766602 },
        context.mission1.landerLocation,
      ],
      walkbackPathSegmentDistances: [0],
      walkbackPathSegmentElevations: null,
      icon: "1f680",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }
}
