var express = require('express');
var router = express.Router();

/* PostgreSQL and PostGIS module and connection setup */
const { Client, Query } = require('pg')

// Setup connection
var username = "Fredd0" // sandbox username
var password = "valek0r0r" // read only privileges on our table
var host = "localhost:5432"
var database = "taxi_beij" // database name
var conString = "postgres://"+username+":"+password+"@"+host+"/"+database; // Your Database Connection

// Set up your database query to display GeoJSON
var drawLines = "SELECT row_to_json(fc) FROM (	SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (	SELECT 'Feature' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((taxi_id,data_time)) As properties FROM tracks As lg LIMIT 1) 	As f) As fc ";

/*var drawTracks = "SELECT row_to_json(fc) FROM
                    (SELECT 'ID_Track' As type,array_to_json(array_agg(track_list)) As features FROM
                      (SELECT 'Trajectoria' As type, array_to_json(array_agg(track_indi)) As features FROM
                        (SELECT 'Ponto' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((taxi_id,data_time)) As properties FROM tracks As lg LIMIT 1500000)
                      As track_indi)
                    As track_list)
                  As fc ";*/

var drawTracks    = "SELECT row_to_json(fc) FROM (SELECT 'Trajectoria' As type, array_to_json(array_agg(track_indi)) As features FROM (SELECT 'P' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((lg.taxi_id,lg.data_time)) As properties FROM (SELECT taxi_id, data_time FROM trajectory_lines GROUP BY taxi_id,data_time ORDER BY taxi_id,data_time) As t JOIN trajectory_lines As lg ON lg.taxi_id = t.taxi_id AND lg.data_time = t.data_time LIMIT 1400000) As track_indi ) As fc ";
var drawTracksMap ="SELECT row_to_json(fc) FROM (	SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (	SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.taxi_id,lg.data_time_Start,lg.data_time_End)) As properties FROM trajectory_lines As lg LIMIT 10000) 	As f) As fc ";

/*WITH multis AS (
                 SELECT taxi_id, min(data_time) AS time_start, max(data_time)
 as time_end, track_id, ST_MakeLine(array_agg(geom ORDER BY
taxi_id,data_time)) AS mylines
                 FROM track_divided_by_time
 GROUP BY taxi_id, track_id
 )

 SELECT taxi_id, (ST_Dump(mylines)).geom,time_start, time_end, track_id
 FROM multis;*/


var select_first = "SELECT taxi_id from (SELECT taxi_id,row_number() as rn,count(*) over () as total_countFROM tracks) t where rn = 1 or rn = total_count";

/*var tentativa = "SELECT (
  SELECT
     ID,
     ValueV,
     Keys = JSON_QUERY('["' + STRING_AGG(STRING_ESCAPE(Keys, 'json'), '","') + '"]')
  FOR JSON PATH
)
FROM #Test
GROUP BY ID, ValueV*/





/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/
/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/

// 1 degree = 60 * 1852 meters = 111.120 kilometers
// ST_DWithin geom geom, distance (in units of sgrid)--- should be meters but it aint, 0.0009 == 100meters sort of





/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/
/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/



/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;

/* GET Postgres JSON data */
router.get('/data', function (req, res) {
  var client = new Client(conString);
  client.connect();
  var query = client.query(new Query(drawTracksMap));
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  query.on("end", function (result) {
      var fs = require('fs');
      fs.writeFileSync('./public/data/geoJSON.json', JSON.stringify(result.rows[0].row_to_json));
      res.send(result.rows[0].row_to_json);
      res.end();
  });
});

/* GET the map page */
var timeB4draw = Math.floor( new Date().getTime()/1000);
router.get('/map', function(req, res) {

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  console.log("Fetching on database");
  var query = client.query(new Query(drawTracksMap)); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  var timefetch = Math.floor( new Date().getTime()/1000);
  var timeafterGet = timefetch-timeB4draw;



  // Pass the result to the map page
  query.on("end", function (result) {

      console.log("Passing data to frontend");
      //var data = require('../public/data/geoJSON.json')
      var data = result.rows[0].row_to_json // Save the JSON as variable data

      res.render('map', {
          title: "BigGeo", // Give a title to our page
          jsonData: data // Pass data to the View
      });
      var timeAdraw = Math.floor( new Date().getTime()/1000);
  });

});

router.get('/query/:long/:lat/:radius/:type', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = req.params.radius/ 111120;

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  var query = client.query(new Query(query_0_args_ContructorQUERIES(req.params.long, req.params.lat, radiusDegrees, req.params.type)  )); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  var timefetch = Math.floor( new Date().getTime()/1000);
  var timeafterGet = timefetch-timeB4draw;
  console.log("Updating map");
  // Pass the result to the map page
  query.on("end", function (result) {
      //var data = require('../public/data/geoJSON.json')
      var dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);
      /*res.render('map', {
          title: "BigGeo", // Give a title to our page
          jsonData: data // Pass data to the View
      });*/
      console.log("DATA PASSED TO BE DRAWN");
      var timeAdraw = Math.floor( new Date().getTime()/1000);
      console.log(timeAdraw-timefetch);
  });

});

//QUERY CONSTRUCTOR
function query_0_args_ContructorQUERIES (long, lat, radius, type){
  if (type == "Default"){
    console.log("Im on a Pass by Lens")
    var queryDB = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.taxi_id,lg.data_time_Start,lg.data_time_End)) As properties FROM trajectory_lines As lg WHERE ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),32650)," + radius + ") LIMIT 5000000) 	As f) As fc"
    return queryDB;
  }

  if (type == "Start"){
    console.log("Im on a Start Points Lens")

    var queryDB = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.taxi_id,lg.data_time_Start,lg.data_time_End, ST_AsGeoJSON(lg.startPointGeom)::json, ST_AsGeoJSON(lg.endPointGeom)::json)) As properties FROM trajectory_lines As lg WHERE ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),32650)," + radius + ") LIMIT 5000000) 	As f) As fc"
    return queryDB;
  }

  if (type == "End"){
    console.log("Im on a Start Points Lens")

    var queryDB = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.taxi_id,lg.data_time_Start,lg.data_time_End)) As properties FROM trajectory_lines As lg WHERE ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),32650)," + radius + ") LIMIT 5000000) 	As f) As fc"
    return queryDB;
  }
}
