# Modifed from MMGIS to return array of arrays and not return intermediate coordinates
# This function returns an array of arrays. Each child array is a list of elevations that correspond to the steps between each pair of coordinates

# Setting axes to "xyz" will return image coordinates instead of lat lons

import sys
import math
from osgeo import gdal
from osgeo import osr
from osgeo.gdalconst import *
from osgeo import __version__ as osgeoversion
from great_circle_calculator.great_circle_calculator import intermediate_point
try:
    from urllib.parse import unquote
except ImportError:
    from urllib import unquote

import argparse

# Make gdal use exceptions instead of their own errors so that they can be caught
gdal.UseExceptions()

# Takes in a [[x,y],[x,y],[x,y],[x,y]...[x,y],[x,y]]
# and returns an array of values on the raster at those points in order


def getRasterDataValues(pointArray):
    valuesArray = []
    for i in range(0, len(pointArray)):
        try:
            value = band.ReadAsArray(
                pointArray[i][0], pointArray[i][1], 1, 1)[0][0]
        except Exception as e:
            # -1100101 = (e)rror
            value = -1100101
            print ("Error at point: " + str(pointArray[i]) + " (probably out of bounds) ", e)

        noData = band.GetNoDataValue()
        if noData is not None:
            noData = float(band.GetNoDataValue())
            decPlaces = 1
            if abs(noData) > 1000000000:
                decPlaces = 10
            if abs(value) >= abs(noData / decPlaces) and abs(value) <= abs(noData * decPlaces):
                value = -1100101
        valuesArray.append(value)
    return valuesArray


# Takes in a [[x1,y1],[x2,y2]]
# and returns [[x1,y1] + (steps - 2) interpolated pairs + [x2,y2]]


def getInterpolatedArrayLinear(endPairs, steps):
    interpolatedArray = []
    # Subtracting 1 from steps so the final point is included in the total steps
    # i.e. number of edges = number of verticies - 1
    steps = steps - 1
    xDif = endPairs[0][0] - endPairs[1][0]
    yDif = endPairs[0][1] - endPairs[1][1]
    xStep = xDif / steps
    yStep = yDif / steps
    for i in reversed(range(0, steps + 1)):
        x = endPairs[1][0] + (xStep * i)
        y = endPairs[1][1] + (yStep * i)
        interpolatedArray.append([x, y])
    return interpolatedArray

# Takes in a [[x1,y1],[x2,y2]]
# and returns [[x1,y1] + (steps - 2) interpolated pairs + [x2,y2]]


def getInterpolatedArray(endPairs, steps):
    interpolatedArray = []

    for i in range(0, steps):
        point = intermediate_point(
            (endPairs[0][1], endPairs[0][0]), (endPairs[1][1], endPairs[1][0]), float(i)/(float(steps) - 1.0))
        interpolatedArray.append([point[1], point[0]])
    return interpolatedArray

# Takes in a [[lat,lon],[lat,lon]...[lat,lon]]
# and returns [[pixel,pixel][pixel,pixel]...[pixel,pixel]]
# based on the predeclared ds (gdal.open(raster))


def latLonsToPixel(latLonPairs):
    # get georeference info
    transform = ds.GetGeoTransform()
    xOrigin = transform[0]
    yOrigin = transform[3]
    pixelWidth = transform[1]
    pixelHeight = transform[5]
    # Create a spatial reference object for the dataset
    srs = osr.SpatialReference()
    if int(osgeoversion[0]) >= 3:
        # GDAL 3 changes axis order: https://github.com/OSGeo/gdal/issues/1546
        srs.SetAxisMappingStrategy(osr.OAMS_TRADITIONAL_GIS_ORDER)
    srs.ImportFromWkt(ds.GetProjection())
    # Set up the coordinate transformation object
    srsLatLong = srs.CloneGeogCS()
    ct = osr.CoordinateTransformation(srsLatLong, srs)
    # Go through all the point pairs and translate them to latitude/longitude pairings
    pixelPairs = []
    for point in latLonPairs:
        # Change the point locations into the GeoTransform space
        (point[1], point[0], holder) = ct.TransformPoint(point[1], point[0])
        # Translate the x and y coordinates into pixel values
        x = (point[1] - xOrigin) / pixelWidth
        y = (point[0] - yOrigin) / pixelHeight
        if math.isinf(x):
            x = 0
        if math.isinf(y):
            y = 0
        # Add the point to our return array
        pixelPairs.append([int(x), int(y)])
    return pixelPairs



# Get arguments
# Path and Steps arguments are passed in with multiple succeeding arguments that are turned into lists
# Each path has a to/from coordinate in "lat,lng,lat,lng" format. The steps argument is the number of steps between each pair of coordinates

parser=argparse.ArgumentParser()
parser.add_argument(   
    "--raster",
    help="The full path of the raster file Example: '/static/1/arizona_dem_10m_3857.tif'",
    type=str,
)
parser.add_argument(   
    "--axes",
    help="Usually 'z' but can be 'xyz' if you want to get the x and y values as well",
    type=str,
)
parser.add_argument(
    "--band",
    help="The band number of the raster to get the value from. Usually '1'",
    type=str
)
parser.add_argument(
    "--path",
    type=str,
)
parser.add_argument(
    "--steps",
    type=str,
)

args = parser.parse_args()

if not args.raster or not args.axes or not args.band or not args.path or not args.steps:
    print(parser.print_help())
    exit()

band = int(args.band)

results = []

# Open the image
ds = gdal.Open(args.raster, GA_ReadOnly)
if ds is None:
    print("Could not open image")
    sys.exit(1)

# Get the band
if args.axes == 'xyz':
    try:
        band = ds.GetRasterBand(3)
        bandX = ds.GetRasterBand(1)
        bandY = ds.GetRasterBand(2)
    except:
        print("Failed to get bands 1, 2 and 3")
        sys.exit(1)
else:
    band = ds.GetRasterBand(band)

pathHyphen = args.path.replace('_', '-')
pathArr = pathHyphen.split('|')
stepsArr = args.steps.split('|')

for i in range(1, len(pathArr), 1):
  lat1, lon1 = pathArr[i - 1].split(',') # from previous point
  lat2, lon2 = pathArr[i].split(',') # to next point
  
  lat1 = float(lat1)
  lon1 = float(lon1)
  lat2 = float(lat2)
  lon2 = float(lon2)

  latLonEndPairs = [[lat1, lon1], [lat2, lon2]]
  thisSteps = int(stepsArr[i - 1]) # steps between previous point and next point

  # Note: converting to pixels first and then interpolating in less accurate
  # Interpolate between those latlons
  latLonArray = getInterpolatedArray(latLonEndPairs, thisSteps)

  # Deep Copy the list
  latLonElevArray = [x[:] for x in latLonArray]

  # Convert ends to image space pixels
  pixelLatLonEndPairs = latLonsToPixel(latLonArray)

  # Find the raster value at each of those points
  elevArray = getRasterDataValues(pixelLatLonEndPairs)

  results.append(elevArray)

print(results)