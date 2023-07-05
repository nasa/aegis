import type { NextApiRequest, NextApiResponse } from "next";
import { deleteFile, unzip } from "server/file/file";
import multer from "multer";
import nextConnect, { RequestHandler } from "next-connect";
import path from "path";
import { withIronSessionApiRoute } from "iron-session/next";
import { ironOptions } from "server/session/config";

/**
 * `/api/file/upload`
 *
 * upload file data
 */
let filename = "";

//next connect middleware
const apiRoute = nextConnect({
  //handle other http methods not defined
  onNoMatch(req: NextApiRequest, res: NextApiResponse) {
    res.status(404).json(`Invalid route`);
  },

  onError(error, req: NextApiRequest, res: NextApiResponse) {
    console.log("nextConnect onError: " + error.message);
    if (error.status === 413) {
      res.status(413).json(`Request Entity Too Large. ${error.message}`); //TODO how to test this?
    } else {
      res.status(500).json(`Upload error. ${error.message}`);
    }
  },
});

//Adds the multer middleware to next connect
apiRoute.use(async (req, res, next) => {
  if (req.session.user) {
    //a multer instance
    const upload = multer({
      storage: multer.diskStorage({
        destination: process.env.PUBLIC_STATIC_DIR, //all files are uploaded into the root PUBLIC_STATIC_DIR location
        filename: (req, file, cb) => {
          cb(null, file.originalname);
          filename = file.originalname;
          req.on("aborted", () => {
            console.log("Client aborted upload");
            file.stream.on("end", () => {
              deleteFile(filename);
            });
            file.stream.emit("end");
          });
        },
      }),
      fileFilter: (req, file, cb) => {
        //only accept zip files
        if (path.extname(file.originalname) === ".zip" && file.mimetype.includes("zip")) {
          cb(null, true);
        } else {
          return cb(new Error("Invalid file type. Only .zip files are allowed"));
        }
      },
      limits: {
        fileSize: Infinity,
      },
    });

    //upload a single file form field "uploadFile"
    //returns a middleware func to be called with args (req, res, callback)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const multerFunc = upload.single("uploadFile") as RequestHandler<unknown, any>;

    //pass in the req/res into the multer middelware
    multerFunc(req, res, (error) => {
      if (error) {
        //handle multer errors (ex: multer file extension check)
        console.log("Multer error: " + error.message);

        //Must force close or else the client keeps request open in "pending" status
        //Client will ungracefully read this as a 500 ERR_CONNECTION_ABORTED
        //https://stackoverflow.com/questions/20553575/how-to-cancel-user-upload-in-formidable-node-js
        res.setHeader("Connection", "close");
        res.status(400).json(error.message);
        return;
      }
      next(); //keep going to the next call in middleware chain (apiRoute.post)
    });
  } else {
    //Must force close or else with larger files (more than 1 part) the client keeps sending data until full file is uploaded (then will finally be rejected)
    //With those larger files, the client will ungracefully read this as a 500 ERR_CONNECTION_ABORTED
    //https://stackoverflow.com/questions/18367824/how-to-cancel-http-upload-from-data-events/18370751#18370751
    res.setHeader("Connection", "close");
    res.status(401).json("Unauthorized");
  }
});

//handle post requests
apiRoute.post(async (req, res: NextApiResponse) => {
  try {
    if (req.body.uploadFile === "null") {
      res.status(400).json("No file provided in request body");
      return;
    } else {
      //Files are uploaded into the root process.env.PUBLIC_STATIC_DIR directory and then unzipped into their desingated subfolder
      const unzipStatus = await unzip(filename, req.body.path, req.body.subfolder); //unzip the file
      if (unzipStatus) {
        res.status(200).json("File extracted"); //return success response
      } else {
        res.status(500).json("File extraction failed. Check server logs"); //return fail response
      }
    }
  } catch (error) {
    if (error instanceof Error) {
      res.status(400).json(error.message);
    } else {
      res.status(400).json("Error uploading file");
    }
  }
});

//change default configs to turn off body parsing and consume as stream
//https://nextjs.org/docs/api-routes/request-helpers#custom-config
export const config = {
  api: {
    bodyParser: false,
  },
};

export default withIronSessionApiRoute(apiRoute, ironOptions);
