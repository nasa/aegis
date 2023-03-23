export namespace MMGIS {
  /**
   * Class to handle all the requests to the MMGIS REST API - https://nasa-ammos.github.io/MMGIS/apis/configure
   */
  export class Server {
    /**
     * Internal Method to add an authorization header to request
     * @private
     */
    private static addAuthorizationHeaderToRequest(): Headers {
      const authHeader = new Headers();
      authHeader.append("Content-Type", "application/json");
      return authHeader;
    }

    /**
     * Internal Method to make a request to the MMGIS API
     * @param url
     * @param headers
     * @param data
     * @param method
     * @private
     */
    private static mmgisRequest(
      url: string,
      headers: Headers | null,
      data,
      method: string
    ): Promise<Response> {
      return fetch(url, {
        method,
        headers,
        body: data,
      });
    }

    /**
     * Get all the missions from the MMGIS API
     */
    public static async getMissions(): Promise<MMGIS_Generic_Response> {
      const response = await this.mmgisRequest(
        "/mmgis/api/configure/missions",
        this.addAuthorizationHeaderToRequest(),
        null,
        "GET"
      );
      const json: MMGIS_Generic_Response = await response.json();
      return json;
    }

    /**
     * Get all the versions for a mission from the MMGIS API
     * @param missionName
     */
    public static async getVersions(missionName: string): Promise<Response> {
      const response = await this.mmgisRequest(
        `/mmgis/api/configure/versions?mission=${missionName}`,
        this.addAuthorizationHeaderToRequest(),
        null,
        "GET"
      );
      const json: any = await response.json();
      return json;
    }

    /**
     * Get the configuration for a mission from the MMGIS API
     * @param missionName
     */
    public static async getMissionConfig(missionName: string): Promise<MMGIS_Mission_Config> {
      const response = await this.mmgisRequest(
        `/mmgis/api/configure/get?mission=${missionName}&full=true`,
        this.addAuthorizationHeaderToRequest(),
        null,
        "GET"
      );
      return (await response.json()) as MMGIS_Generic_Response;
    }

    /**
     * Verifies if a missions configuartion object is valid or not
     * @param config
     */
    public static async validateMissionConfig(
      config: Object
    ): Promise<MMGIS_Validate_Mission_Config> {
      const response = await this.mmgisRequest(
        "/mmgis/api/configure/validate",
        this.addAuthorizationHeaderToRequest(),
        `${config}`,
        "POST"
      );
      const json: any = await response.json();
      return json;
    }

    /**
     * Adds or Saves a mission configuration to the MMGIS API
     *
     * @param mission
     * @param config
     */
    public static async saveMissionConfiguration(config: Object): Promise<Response> {
      return this.mmgisRequest(
        "/mmgis/api/configure/upsert",
        this.addAuthorizationHeaderToRequest(),
        `${config}`,
        "POST"
      );
    }

    /**
     * Adds a layer to a mission configuration
     * @param mission
     * @param layer
     */
    public static async addLayerToMissionConfiguration(config: Object): Promise<Response> {
      return this.mmgisRequest(
        "/mmgis/api/configure/addLayer",
        this.addAuthorizationHeaderToRequest(),
        `${config}`,
        "POST"
      );
    }

    /**
     * Updates a layer in a mission configuration
     * @param mission
     * @param layerUUID
     * @param layer
     */
    public static async updateLayerToMissionConfiguration(
      mission: string,
      layerUUID: string,
      layer: Object
    ): Promise<Response> {
      const config = {
        mission,
        layerUUID,
        layer,
        forceClientUpdate: true,
      };
      return this.mmgisRequest(
        "/mmgis/api/configure/updateLayer",
        this.addAuthorizationHeaderToRequest(),
        JSON.stringify(config),
        "POST"
      );
    }

    /**
     * Removes a layer from a mission configuration
     * @param config
     */
    public static async removeLayerFromMissionConfiguration(config: Object): Promise<Response> {
      return this.mmgisRequest(
        "/mmgis/api/configure/removeLayer",
        this.addAuthorizationHeaderToRequest(),
        `${config}`,
        "POST"
      );
    }

    /**
     * Updates the initial view of a mission configuration
     * @param mission
     * @param latitude
     * @param longitude
     * @param zoom
     */
    public static async updateInitialViewOfMap(
      mission: string,
      latitude: number,
      longitude: number,
      zoom: number
    ): Promise<Response> {
      return this.mmgisRequest(
        "/mmgis/api/configure/updateInitialView",
        this.addAuthorizationHeaderToRequest(),
        {
          mission,
          latitude,
          longitude,
          zoom,
        },
        "POST"
      );
    }
  }

  /**
   * Class to handle all the requests to the MMGIS Javascript API - https://nasa-ammos.github.io/MMGIS/apis/javascript
   */
  export class Client {}
}
