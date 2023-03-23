/**
 * This file contains typings for the MMGIS API
 */

interface MMGIS_Generic_Response {
  status?: "success" | "failure" | "error";
  message?: string;
  missions: Array<>;
  errors?: {
    valid: boolean;
    errors: Array<MMGIS_Error>;
  };
}

interface MMGIS_Layer_Response {
  status?: "success" | "failure" | "error";
  message?: string;
  missions: Array<>;
  errors?: Array<MMGIS_Error>;
}

interface MMGIS_Mission_Config {
  status?: "success" | "failure" | "error";
  message?: string;
  mission?: string;
  config?: MMGIS_Config;
  version?: number;
}

interface MMGIS_Validate_Mission_Config {
  status?: "success" | "failure" | "error";
  message?: string;
  errors?: {
    valid: boolean;
    errors: Array<MMGIS_Error>;
  };
}

interface MMGIS_Error {
  type: string;
  reason: string;
  invalidFields: Array<String>;
}

interface MMGIS_Error_Layer {
  type: string;
  reason: string;
  invalidFields: Array<String>;
}
