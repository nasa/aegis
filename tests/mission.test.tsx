import { createMocks, createResponse, createRequest, RequestMethod } from 'node-mocks-http';
import {getMissionById, returnMissionJson} from '../pages/api/mission/[id]'
import { describe, expect, test, afterAll, it, beforeAll } from "@jest/globals";
import {NextApiRequest, NextApiResponse} from "next";
import Login from "../pages/api/users/login";
import Mikro from "utils/mikro";
import {getAllMissions, returnAllMissionsJson} from "../pages/api/mission/missions";
import { Factory } from "@mikro-orm/seeder";
import {Mission} from "server/database/models/mission.model";
import {PermissionRole, User} from "server/database/models/user.model";

let testMission: Mission;
let testAdmin: User;
class MissionFactory extends Factory<Mission> {
    model = Mission;
    definition() {
        return {
            mission: 'Gaia-1',
            config: {},
            version: 1,
            createdAt: new Date(),
            updatedAt: new Date(),
        }
    }
}
class UserFactory extends Factory<User> {
    model = User;
    definition() {
        return new User('testAdmin', 'superSecretPassword', 'gaia@nasa.gov', PermissionRole.ADMIN);
    }
}

beforeAll( async () => {
    await Mikro.getORM();
    const model = await Mikro.getEM();
    testAdmin = await new UserFactory(model).createOne();
    testMission = await new MissionFactory(model).createOne();
    await Mikro.closeORM();
});

describe('Mission API Endpoint', () => {
    type ApiRequest = NextApiRequest & ReturnType<typeof createRequest>;
    type ApiResponse = NextApiResponse & ReturnType<typeof createResponse>;

    function mockRequestResponse(method: RequestMethod = 'POST') {
        const {
            req,
            res,
        }: { req: ApiRequest; res: ApiResponse } = createMocks({ method });
        return { req, res};
    }

    it('Mission: Returns Mission Json', async () => {
        const {req, res} = mockRequestResponse();
        req.body = { username: 'testAdmin', password: 'superSecretPassword' };
        await Login(req,res);
        req.query = {id: testMission.id.toString()};
        await returnMissionJson(req, res);
        await expect(res.statusCode).toBe(200);
        await expect(res.statusMessage).toEqual('OK');
    });

    test('Mission: Fails to find mission', async () => {
        const {req, res} = mockRequestResponse();
        req.body = { username: 'testAdmin', password: 'superSecretPassword' };
        await Login(req,res);
        req.query = {id: '99999'};
        await returnMissionJson(req, res);
        expect(res.statusCode).toBe(500);
        expect(res.statusMessage).toEqual('OK');
    });

    test('Mission: Fails to Authorize', async () => {
        const {req, res} = mockRequestResponse();
        req.query = {id: testMission.id.toString()};
        await returnMissionJson(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.statusMessage).toEqual('OK');
    });

    test('Mission: Returns Mission Data', async () => {
        const mission = await getMissionById(testMission.id);
        await Mikro.closeORM();
        expect(mission).not.toBeNull();
    });

    test('Missions: Returns Missions Json', async () => {
        const {req, res} = mockRequestResponse();
        req.body = { username: 'testAdmin', password: 'superSecretPassword' };
        await Login(req,res);
        await returnAllMissionsJson(req, res);
        expect(res.statusCode).toBe(200);
        expect(res.statusMessage).toEqual('OK');
    });

    test('Missions: Returns Auth Failure', async () => {
        const {req, res} = mockRequestResponse();
        await returnAllMissionsJson(req, res);
        expect(res.statusCode).toBe(401);
        expect(res.statusMessage).toEqual('OK');
    });

    test('Missions: Returns Mission Data', async () => {
        const mission = await getAllMissions();
        await Mikro.closeORM();
        expect(mission).not.toBeNull();
    });

});

afterAll(async () => {
    //Cleanup our Database
    await Mikro.getORM();
    const model = await Mikro.getEM();
    await model.nativeDelete(Mission, {id: testMission.id});
    await model.nativeDelete(User, {id: testAdmin.id});
    // Closing the DB connection allows Jest to exit successfully.
    await Mikro.closeORM();
});