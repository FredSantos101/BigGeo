const express = require('express');
const router = express.Router();
const union = require('@turf/union');
const difference = require('@turf/difference');
const intersect = require("@turf/intersect")
const clone = require('@turf/clone');
const truncate = require('@turf/truncate');
const polygon = require("@turf/helpers")
const cleancoords = require("@turf/clean-coords");
const turf = require("turf");
const multer  = require('multer')   //Use to pass files from client to server using connect-busboy
const {spawn} = require('child_process')

/* PostgreSQL and PostGIS module and connection setup */
const { Client, Query } = require('pg')


//Create db script
var databaseCreation = "template_postgis";
// Setup connection
var username = "postgres" // sandbox username
var password = "postgres" // read only privileges on our table
var host = "localhost:5432"
var database = "taxi_beij" // database name
var conString = "postgres://"+username+":"+password+"@"+host+"/"+database; // Your Database Connection
var conString0 = "postgres://"+username+":"+password+"@"+host+"/"+databaseCreation; // Your Database Connection

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
var drawTracksMap ="SELECT row_to_json(fc) FROM (	SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (	SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM trajectory_lines3 As lg LIMIT 10000) 	As f) As fc ";

/*WITH multis AS (
                 SELECT tid, min(data_time) AS time_start, max(data_time)
 as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo
                 FROM track_divided_by_time_30s
 GROUP BY tid
 )

 SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) , velo
 FROM multis*/

 /*
 WITH tryingToDivide AS (
	SELECT tid as idThis, geom as geomThis, data_time as dataTime,
	lag(tid) over (order by tid asc,data_time asc) as idPrev,
	lag(geom) over (order by tid asc, data_time asc) as geomPrev
	FROM track_divided_by_time_upload)

UPDATE track_divided_by_time_upload
SET linegeom =
        CASE
        WHEN idThis = idPrev THEN
        ST_SetSRID(ST_MakeLine(geomPrev,geomThis),4326)
        ELSE
          NULL
        END
FROM tryingToDivide
WHERE tid = idThis AND  data_time = dataTime
 */


var select_first = "SELECT taxi_id from (SELECT taxi_id,row_number() as rn,count(*) over () as total_countFROM tracks) t where rn = 1 or rn = total_count";


/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/
/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/

// 1 degree = 60 * 1852 meters = 111.120 kilometers
// ST_DWithin geom geom, distance (in units of sgrid)--- should be meters but it aint, 0.0009 == 100meters sort of


var activeQuery = "";


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
  var client0 = new Client(conString0); // Setup our Postgres Client
  client0.connect(); // connect to the client
  console.log("Connected to template_postgis");
  var checkIfDBExists = "SELECT datname FROM pg_catalog.pg_database WHERE datname = 'taxi_beij'";
  client0.query(new Query(checkIfDBExists)).on("end",function(result, err){
    if(result.rowCount != 1){
      client0.query(new Query("CREATE DATABASE taxi_beij")).on("end",function(err){
        if (err)  {
          console.log('DB already exists');
        } // ignore if the db is there

        client0.end(); // close the connection
        console.log("Disconnected from template_postgis");
        startMap(req, res);
      });
    }
    else{
      startMap(req, res);
    }

  }); // create user's db
});

function startMap(req, res){
  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  console.log("New client connected to new taxi_beij");

  var createPostgisExt = "CREATE EXTENSION IF NOT EXISTS postgis;CREATE EXTENSION IF NOT EXISTS postgis_topology;"
  var createDB =  "CREATE TABLE IF NOT EXISTS public.track_divided_by_time_30s(taxi_id integer,long double precision,lat double precision,data_time timestamp without time zone,vel double precision,traj_id integer,start_long double precision,start_lat double precision,end_long double precision,end_lat double precision,tid integer,geom geometry(Point,4326),startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),linegeom geometry(LineString,4326)) WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.track_divided_by_time_30s OWNER to postgres;GRANT ALL ON TABLE public.track_divided_by_time_30s TO postgres; CREATE INDEX IF NOT EXISTS linegeom_trackdivUpload ON public.track_divided_by_time_30s USING gist (linegeom) TABLESPACE pg_default; CREATE INDEX IF NOT EXISTS tid_indexUpload ON public.track_divided_by_time_30s USING btree(tid)TABLESPACE pg_default;";
  var createDB1 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist ON public.trajectory_lines USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist ON public.trajectory_lines USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist ON public.trajectory_lines USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index ON public.trajectory_lines USING btree (track_id) TABLESPACE pg_default;"
  var createDB2 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines1(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines1 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines1 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist1 ON public.trajectory_lines1 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist1 ON public.trajectory_lines1 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist1 ON public.trajectory_lines1 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index1 ON public.trajectory_lines1 USING btree (track_id) TABLESPACE pg_default;"
  var createDB3 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines2(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines2 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines2 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist2 ON public.trajectory_lines2 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist2 ON public.trajectory_lines2 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist2 ON public.trajectory_lines2 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index2 ON public.trajectory_lines2 USING btree (track_id) TABLESPACE pg_default;"
  var createDB4 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines3(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines3 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines3 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist3 ON public.trajectory_lines3 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist3 ON public.trajectory_lines3 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist3 ON public.trajectory_lines3 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index3 ON public.trajectory_lines3 USING btree (track_id) TABLESPACE pg_default;"
  client.query(new Query(createPostgisExt)).on("end",function(err){
      if(err){
        console.log("Extentions already existed");
      }
      console.log("Extentions created");
      var createAllDBs = client.query(new Query(createDB));
      var createAllDBs1 = client.query(new Query(createDB1));
      var createAllDBs2 = client.query(new Query(createDB2));
      var createAllDBs3 = client.query(new Query(createDB3));
      var createAllDBs4 = client.query(new Query(createDB4));
      createAllDBs.on("end",function(){
        console.log("Table track_divided_by_time_30s created");
      })
      createAllDBs1.on("end",function(){
        console.log("Table trajectory_lines created");
      })
      createAllDBs2.on("end",function(){
        console.log("Table trajectory_lines1 created");
      })
      createAllDBs3.on("end",function(){
        console.log("Table trajectory_lines2 created");
      })
      createAllDBs4.on("end",function(){

        activeQuery = "";
        console.log("Table trajectory_lines3 created");
        var client1 = new Client(conString); // Setup our Postgres Client
        client1.connect(); // connect to the client
        console.log("Fetching on database");
        var query = client1.query(new Query(drawTracksMap)); // Run our Query
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
            client.end();
        });
      })



    });
}

router.get('/query/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = (req.params.radius/ 111120).toFixed(8);

  //var minDegrees = req.params.minValue/ 111120;

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  var query = client.query(new Query(query_args_ContructorQUERIES(req.params.tab, req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue))); // Run our Query
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

      console.log("DATA PASSED TO BE DRAWN");
      var timeAdraw = Math.floor( new Date().getTime()/1000);
      console.log(timeAdraw-timefetch);
      client.end();
  });

});

router.get('/attQuery/:tab/:long/:lat/:radius', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = (req.params.radius/ 111120).toFixed(8);

  //var minDegrees = req.params.minValue/ 111120;

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  var query = client.query(new Query(query_args_ContructorATTQUERIES(req.params.tab, req.params.long, req.params.lat, radiusDegrees))); // Run our Query
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

      console.log("DATA PASSED TO BE DRAWN");
      var timeAdraw = Math.floor( new Date().getTime()/1000);
      console.log(timeAdraw-timefetch);
      client.end();
  });

});

router.get('/attQueryNEW/:tab/:geom', function(req, res) {

  //var minDegrees = req.params.minValue/ 111120;

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  var query = client.query(new Query(query_args_ContructorATTQUERIESNEW(req.params.tab, req.params.geom))); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  console.log("Updating map");
  // Pass the result to the map page
  query.on("end", function (result) {
      //var data = require('../public/data/geoJSON.json')
      var dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      console.log("DATA PASSED TO BE DRAWN");
      client.end();
  });

});

router.get('/queryRemoval/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = (req.params.radius/ 111120).toFixed(8);

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  var query = client.query(new Query(query_args_DecontructorQUERIES(req.params.tab,req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue))); // Run our Query
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

      console.log("DATA PASSED TO BE DRAWN");
      var timeAdraw = Math.floor( new Date().getTime()/1000);
      console.log(timeAdraw-timefetch);
      client.end();
  });

});

router.get('/queryMoved/:tab/:long/:lat/:radius/:type/:minValue/:maxValue/:longNEW/:latNEW/:radiusNEW/:typeNEW/:minValueNEW/:maxValueNEW', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = (req.params.radius/ 111120).toFixed(8);
  console.log(radiusDegrees);
  var radiusDegreesNEW = (req.params.radiusNEW/ 111120).toFixed(8);

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  //DELETE OLD QUERY OF THE LENS
  console.log(activeQuery);
  var deleteOldPos = query_args_DecontructorQUERIES(req.params.tab,req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue);
  console.log(activeQuery);
  var newQuery = query_args_ContructorQUERIES(req.params.tab,req.params.longNEW, req.params.latNEW, radiusDegreesNEW, req.params.typeNEW, req.params.minValueNEW, req.params.maxValueNEW);
  console.log(activeQuery);
  var query = client.query(new Query(newQuery)); // Run our Query
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

      console.log("DATA PASSED TO BE DRAWN");
      var timeAdraw = Math.floor( new Date().getTime()/1000);
      console.log(timeAdraw-timefetch);
      client.end();
  });

});

//
//QUERY CONSTRUCTORS
//

function query_args_ContructorQUERIES (tab,long, lat, radius, type, minValue, maxValue){

  if (activeQuery.length == 0){
    activeQuery = " WHERE ";
  }

  var firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM " + tab + " As lg";
  var secondPart = " LIMIT 5000000) 	As f) As fc";
  if (activeQuery.length != 7){
    activeQuery = activeQuery + " AND ";
  }
  if (type == "Default"){
    console.log("Im on a Pass by Lens");
    var queryDB =  "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;
    console.log(activeQuery);
    return firstPart + activeQuery + secondPart;
  }

  else if (type == "Start"){
    console.log("Im on a Start Point Lens");
    var queryDB = "ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }

  else if (type == "End"){
    console.log("Im on an End Point Lens");
    var queryDB = "ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }
  else if (type == "Vel_avg"){
    console.log("Im on an average Velocity Lens");

    var queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minValue + ") AND (veloc_avg <=" + maxValue + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }
  else if (type == "Length"){
    console.log("Im on a Length Lens");
    var minValDegree = minValue / 111120;
    var maxValDegree = maxValue / 111120;
    var queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }
  else if (type == "Time_Interval"){
    console.log("Im on a Time Interval Lens");
    var minValTime = minValue;  //UNIX TIME
    var maxValTime = maxValue;  //UNIX TIME
    var queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + ") OR data_time_end BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" + maxValTime + "))";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }

  else if (type == "Time_Duration"){
    console.log("Im on a Duration Lens");
    var minValTime = minValue;  //UNIX TIME
    var maxValTime = maxValue;  //UNIX TIME
    var queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("I already exist");
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    activeQuery = activeQuery + queryDB;

    return firstPart + activeQuery + secondPart;
  }
  else{
    console.log("The string is empty");
    return "";}

}
function query_args_ContructorATTQUERIES (tab,long, lat, radius){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom
  var withsPart ="WITH trackDivided as ( SELECT tid, vel as velPerPoint, linegeom, data_time FROM track_divided_by_time_30s WHERE ST_DWithin(linegeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")), trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + "), multi as (SELECT trackDivided.tid, array_agg(trackDivided.velPerPoint ORDER BY trackDivided.tid, trackDivided.data_time) as velPerPoint, ST_MakeLine(array_agg(trackDivided.linegeom ORDER BY trackDivided.tid,trackDivided.data_time)) AS linegeom FROM trackDivided, trajectoryLine WHERE trackDivided.tid = trajectoryLine.track_id GROUP BY trackDivided.tid) SELECT multi.linegeom as linegeom, multi.velPerPoint as velPerPoint, trajectoryLine.length as length, trajectoryLine.veloc_avg as veloc_avg, trajectoryLine.duration, trajectoryLine.data_time_End  FROM trajectoryLine , multi WHERE multi.tid = trajectoryLine.track_id";
  var firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.linegeom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.velPerPoint)) As properties FROM (" + withsPart + ") As lg";
  var secondPart = " LIMIT 5000000) 	As f) As fc";

  console.log("Im on an attribute Lens");
  console.log(withsPart);
  return firstPart + secondPart;

}

function query_args_ContructorATTQUERIESNEW (tab,geomGeoJson){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom


  var withsPart ="WITH trackDivided as ( SELECT tid, vel as velPerPoint, linegeom, data_time FROM track_divided_by_time_30s WHERE ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AND ST_Intersects(linegeom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326))), trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + "), multi as (SELECT trackDivided.tid, array_agg(trackDivided.velPerPoint ORDER BY trackDivided.tid, trackDivided.data_time) as velPerPoint, ST_Intersection(ST_MakeLine(array_agg(trackDivided.linegeom ORDER BY trackDivided.tid,trackDivided.data_time)),ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AS linegeom FROM trackDivided, trajectoryLine WHERE trackDivided.tid = trajectoryLine.track_id GROUP BY trackDivided.tid) SELECT multi.linegeom as linegeom, multi.velPerPoint as velPerPoint, trajectoryLine.length as length, trajectoryLine.veloc_avg as veloc_avg, trajectoryLine.duration, trajectoryLine.data_time_End  FROM trajectoryLine , multi WHERE multi.tid = trajectoryLine.track_id";
  var firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.linegeom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.velPerPoint)) As properties FROM (" + withsPart + ") As lg";
  var secondPart = " LIMIT 5000000) 	As f) As fc";

  console.log("Im on an attribute Lens");
  console.log(withsPart);
  return firstPart + secondPart;

}


//
//QUERY DECONSTRUCTORS
//

function replaceGlobally(original, searchTxt, replaceTxt) {
  original = original.split(searchTxt).join(replaceTxt);
  return original;
}

function query_args_DecontructorQUERIES (tab ,long, lat, radius, type, minVal, maxVal){

  var andString = " AND ";
  var firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM " + tab + " As lg";
  var secondPart = " LIMIT 40000) 	As f) As fc";

  if(activeQuery == ""){
      console.log("Query was already empty no need to remove anything")
  }
  else if (type == "Default"){
    var queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

    console.log("Im on a Pass by Lens");
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log(activeQuery);
  }

  else if (type == "Start"){
    var queryDB = andString + "ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

    console.log("Im on a Start Point Lens");
    if (activeQuery.indexOf(" AND ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")") !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log(activeQuery);

  }

  else if (type == "End"){
    var queryDB = andString + "ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

    console.log("Im on a End Point Lens");
    if (activeQuery.indexOf(" AND ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")") !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
      console.log(activeQuery)
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log(activeQuery);

  }

  else if (type == "Vel_avg"){
    var queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minVal + ") AND (veloc_avg <=" + maxVal + ")";

    console.log("Im on a Velocity Lens");
    if (activeQuery.indexOf(" AND ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minVal + ") AND (veloc_avg <=" + maxVal + ")") !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minVal + ") AND (veloc_avg <=" + maxVal + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minVal + ") AND (veloc_avg <=" + maxVal + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log(activeQuery);

  }

  else if (type == "Length"){
    var minValDegree = minVal / 111120;
    var maxValDegree = maxVal / 111120;
    var queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")";

    console.log("Im on a Length  Lens");
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log("The active query is:" + activeQuery);
  }

  else if (type == "Time_Interval"){
    var minValTime = minVal;  //UNIX TIME
    var maxValTime = maxVal;  //UNIX TIME
    var queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + ") OR data_time_end BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" + maxValTime + "))";

    console.log("Im on a Time Interval  Lens");
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + ") OR data_time_end BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" + maxValTime + "))") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + ") OR data_time_end BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" + maxValTime + "))";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log("The active query is:" + activeQuery);
  }
  else if (type == "Time_Duration"){
    var minValTime = minVal;  //UNIX TIME
    var maxValTime = maxVal;  //UNIX TIME
    var queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")";

    console.log("Im on a Time Duration  Lens");
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log("The active query is:" + activeQuery);
  }

  if (activeQuery.indexOf(" WHERE  AND ") != -1){
    activeQuery = replaceGlobally(activeQuery, " WHERE  AND ", " WHERE ");
  }
  if (activeQuery.length == 7){
    activeQuery = "";
  }

  return firstPart + activeQuery + secondPart;
}

// Turf functions

router.get('/intersect/:firstGeom/:secondGeom', function(req, res) {

  var firsGeom = JSON.parse(req.params.firstGeom);
  var secondGeom = JSON.parse(req.params.secondGeom);
  var intersectionVar = intersect.default(firsGeom,secondGeom);
  res.send(JSON.stringify(intersectionVar));


});

router.get('/difference/:firstGeom/:secondGeom', function(req, res) {

  var firsGeom = JSON.parse(req.params.firstGeom);
  var secondGeom = JSON.parse(req.params.secondGeom);
  var differenceVar = difference(firsGeom,secondGeom);
  res.send(JSON.stringify(differenceVar));


});

router.get('/interdif/:firstGeom/:secondGeom', function(req, res) {

  var firstGeom = JSON.parse(req.params.firstGeom);
  var secondGeom = JSON.parse(req.params.secondGeom);
  if(firstGeom != null && secondGeom != null){
    var intersectionVar = turf.intersect(firstGeom,secondGeom);
    var options = {precision: 6, coordinates: 2};
    if(intersectionVar != null){
      var differenceVar = turf.difference(firstGeom,secondGeom);
      var list = [truncate.default(cleancoords.default(intersectionVar),options),truncate.default(cleancoords.default(differenceVar),options)];
      res.send(JSON.stringify(list));
    }
    else{
      res.send(JSON.stringify([null, null]));
    }
  }
  else{
    res.send(JSON.stringify([null, null]));
  }


});

router.get('/union/:firstGeom/:secondGeom', function(req, res) {
  var firsGeom = JSON.parse(req.params.firstGeom);
  var secondGeom = JSON.parse(req.params.secondGeom);
  var unionVar = union.default(firsGeom,secondGeom);
  res.send(JSON.stringify(unionVar));


});

//UPLOAD FILES FUNCTIONS

var storage = multer.diskStorage({
  destination: function(req, file, cb) {
      cb(null, './public/data');
   },
  filename: function (req, file, cb) {
      cb(null , file.originalname);
  }
});
var upload = multer({storage: storage}).array('track', 1000);

router.post('/fileUpload', (req, res, next) => {
  upload(req,res,function(err) {
    const subprocess = callPython(1,1);
      try {

        console.log("Files have been uploaded");
        console.log("Starting the parsing, joining different file formats as one");
        //const pyProg = spawn('python', ['./public/python/joinTracks-1.py']);

      } catch(err) {
            console.log(err);
            res.send(400);
      }
      // print output of script
      subprocess.stdout.on('data', (data) => {
        console.log("Files have been parsed");
      });
      subprocess.stderr.on('data', (data) => {
        console.log(`error:${data}`);
      });
      subprocess.stderr.on('close', (data) => {
        console.log("Dividing the trajectories");
        preProcessFiles2();
      });


  });

});

function preProcessFiles2(){
  const subprocess2 = callPython(2,1);
  // print output of script
  subprocess2.stdout.on('data', (data) => {
    console.log("Tracks have been divided");
  });
  subprocess2.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess2.stderr.on('close', () => {
    console.log("Deleting trajectories with the same time");
    preProcessFiles3();
  });
}
function preProcessFiles3(){
  const subprocess3 = callPython(3,1);
  // print output of script
  subprocess3.stdout.on('data', (data) => {
    console.log("Points with the same time deleted");
  });
  subprocess3.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess3.stderr.on('close', () => {
    console.log("Deleting stop points");
    preProcessFiles4();
  });
}
function preProcessFiles4(){
  const subprocess4 = callPython(4,1);
  // print output of script
  subprocess4.stdout.on('data', (data) => {
    console.log("Stop points deleted");
  });
  subprocess4.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess4.stderr.on('close', () => {
    console.log("Deleting trajectories with only 1 point");
    preProcessFiles5();
  });
}
function preProcessFiles5(){
  const subprocess5 = callPython(5,1);
  // print output of script
  subprocess5.stdout.on('data', (data) => {
    console.log("Trajectories with only 1 point deleted");
  });
  subprocess5.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess5.stderr.on('close', () => {
    console.log("Creating tracks");
    preProcessFiles6();
  });
}
function preProcessFiles6(){
  const subprocess6 = callPython(6,1);
  // print output of script
  subprocess6.stdout.on('data', (data) => {
    console.log("Creating tracks");
  });
  subprocess6.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess6.stderr.on('close', () => {
    console.log("Going to place the unique ID");
    preProcessFiles7();
  });
}
function preProcessFiles7(){
  var clientPost = new Client(conString); // Setup our Postgres Client
  clientPost.connect(); // connect to the client
  var queryViewMaxTid = clientPost.query(new Query("SELECT max(tid) FROM track_divided_by_time_30s"), (err, res) => {
    if(err)
      console.log(err);
  });
  queryViewMaxTid.on("end", function (result) {
    console.log("BELLOW IS THE VALUE OF MAX");

    var maxNumber = result.rows[0].max;
    if(maxNumber == null){
      maxNumber = 0;
    }
    else {
      maxNumber = parseInt(result.rows[0].max);
    }
    console.log(maxNumber);
    const subprocess7 = callPython(7, maxNumber);
    // print output of script
    subprocess7.stdout.on('data', (data) => {
      console.log("Unique ID placed");
    });
    subprocess7.stderr.on('data', (data) => {
      console.log(`error:${data}`);
    });
    subprocess7.stderr.on('close', () => {
      console.log("Going to upload to the DB");
      createDB();
    });
  });
}


function createDB(){
  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  var createDB = "CREATE TABLE public.track_divided_by_time_upload(taxi_id integer,long double precision,lat double precision,data_time timestamp without time zone,vel double precision,traj_id integer,start_long double precision,start_lat double precision,end_long double precision,end_lat double precision,tid integer,geom geometry(Point,4326),startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),linegeom geometry(LineString,4326)) WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.track_divided_by_time_upload OWNER to postgres;GRANT ALL ON TABLE public.track_divided_by_time_upload TO postgres; CREATE INDEX IF NOT EXISTS linegeom_trackdivUpload ON public.track_divided_by_time_upload USING gist (linegeom) TABLESPACE pg_default; CREATE INDEX IF NOT EXISTS tid_indexUpload ON public.track_divided_by_time_upload USING btree(tid)TABLESPACE pg_default;";
  client.query(createDB, async function (err, result) {
    if (err) {
      console.log(err)
      console.log("Database already exists, going to clean it now");
      await client.query(new Query("DELETE FROM track_divided_by_time_upload")).on("end",function(){client.end()
        insertToDB();});
    }
    else{
      client.end();
      insertToDB();
    }
  });
}


function insertToDB() {
    var numberOfLinesBy2k;
    const countLinesInFile = require('count-lines-in-file')
    countLinesInFile('./public/data/finalOfALL.txt' , (error,number) => {

      console.log("Number of lines bellow");
      var numberL = parseInt(number);
      console.log(number);
      numberOfLinesBy2k = Math.floor(numberL/4000);
      var remainder = numberL % 4000;
      if(remainder > 0){
        numberOfLinesBy2k++;
      }
      console.log("Number of lines by 4k in the file generated");
      console.log(numberOfLinesBy2k);
      var exec = require('child_process').exec;
      //var childCountNumberLines = spawn("(get-Content ./public/data/finalOfALL.txt | measure-object -Line).Lines");
      //childCountNumberLines.stdout.on("data",function(data){
      //exec("wc –l  ./public/data/finalOfALL.txt", function (err, stdout) {

      var lineReader = require('readline').createInterface({
        input: require('fs').createReadStream('./public/data/finalOfALL.txt')
      });
      var contLine = 0;

      var stringOfRows = "";
      lineReader.on('line',function (line) {
        if(contLine ==0){
          stringOfRows = "("+line.replace(/\n/g,'')+")";
        }
        else{
          stringOfRows = stringOfRows + ",("+line.replace(/\n/g,'')+")";
        }
        contLine ++;
        if (contLine == 4000){
          insertLines(stringOfRows,numberOfLinesBy2k);
          contLine = 0;
          stringOfRows = "";
        }
      }).on('close', function(){
        insertLines(stringOfRows,numberOfLinesBy2k);
      })
    });

}
var ClientEndTimes = 0;
function insertLines(stringOfRows,numberOfLinesBy2k){
  var clientPost = new Client(conString); // Setup our Postgres Client
  clientPost.connect(); // connect to the client
  var queryPost = clientPost.query(new Query("INSERT INTO track_divided_by_time_upload(taxi_id,long,lat,data_time,vel,traj_id,start_long,start_lat,end_long,end_lat,tid) VALUES"+stringOfRows), (err, res) => {
    if(err)
      console.log(err);
  });
  queryPost.on("end", function (result) {
    clientPost.end();
    ClientEndTimes++;
    console.log("Inserted 4k lines");
    console.log(ClientEndTimes);
    console.log(numberOfLinesBy2k);
    if(ClientEndTimes >= numberOfLinesBy2k){

      ClientEndTimes=0;
      console.log("Will now calculate the geoms");
      calculateGeoms();
    }
  });
}
var geomsCalcualted = 0;
function calculateGeoms(){
  var queryCreateGeoms1 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms1.connect(); // connect to the client
  var queryCreateGeoms2 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms2.connect(); // connect to the client
  var queryCreateGeoms3 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms3.connect(); // connect to the client
  var geom1 = queryCreateGeoms1.query(new Query("UPDATE track_divided_by_time_upload SET geom = ST_SetSRID(ST_MakePoint(long,lat),4326);"));
  var geom2 = queryCreateGeoms2.query(new Query("UPDATE track_divided_by_time_upload SET startpointgeom = ST_SetSRID(ST_MakePoint(start_long,start_lat),4326);"));
  var geom3 = queryCreateGeoms3.query(new Query("UPDATE track_divided_by_time_upload SET endpointgeom = ST_SetSRID(ST_MakePoint(end_long,end_lat),4326);"));
  geom1.on("end", function(){
    queryCreateGeoms1.end();
    geomsCalcualted++;
    console.log("Main Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide();
    }
  });
  geom2.on("end", function(){
    queryCreateGeoms2.end();
    geomsCalcualted++;
    console.log("Start Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide();
    }
  });
  geom3.on("end", function(){
    queryCreateGeoms3.end();
    geomsCalcualted++;
    console.log("End Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide();
    }
  });
}

function unifySubSegsANDDivide(){
  var clientUnify = new Client(conString); // Setup our Postgres Client
  clientUnify.connect(); // connect to the client
  console.log("Gonna unify the point by pairs for attribute lenses");
  var query = clientUnify.query(new Query(" WITH tryingToDivide AS (SELECT tid as idThis, geom as geomThis, data_time as dataTime, lag(tid) over (order by tid asc,data_time asc) as idPrev, lag(geom) over (order by tid asc, data_time asc) as geomPrev FROM track_divided_by_time_upload) UPDATE track_divided_by_time_upload SET linegeom = CASE WHEN idThis = idPrev THEN ST_SetSRID(ST_MakeLine(geomPrev,geomThis),4326) ELSE NULL END FROM tryingToDivide WHERE tid = idThis AND  data_time = dataTime")); // Run our Query
  query.on("end", function (result) {
    console.log("Completed pairs for attribute lenses");
    var queryUpload = clientUnify.query(new Query("INSERT INTO track_divided_by_time_30s SELECT * FROM track_divided_by_time_upload"));
    queryUpload.on("end", function (result) {
      console.log("Tracks ready for attribute lenses");

    });
  });

  var clientCreateLines1 = new Client(conString); // Setup our Postgres Client
  clientCreateLines1.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 1");
  var query = clientCreateLines1.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng <= 300)")); // Run our Query
  query.on("end", function (result) {
    clientCreateLines1.end();
    console.log(result);
    console.log("table 1 completed");
  });
  var clientCreateLines2 = new Client(conString); // Setup our Postgres Client
  clientCreateLines2.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 2");
  var query = clientCreateLines2.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines1 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 300 AND leng <= 700)")); // Run our Query
  query.on("end", function (result) {
    clientCreateLines2.end();
    console.log(result);
    console.log("table 2 completed");
  });
  var clientCreateLines3 = new Client(conString); // Setup our Postgres Client
  clientCreateLines3.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 3");
  var query = clientCreateLines3.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines2 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 700 AND leng <= 1500)")); // Run our Query
  query.on("end", function (result) {
    clientCreateLines3.end();
    console.log(result);
    console.log("table 3 completed");
  });
  var clientCreateLines4 = new Client(conString); // Setup our Postgres Client
  clientCreateLines4.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 4");
  var query = clientCreateLines4.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines3 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 1500)")); // Run our Query
  query.on("end", function (result) {

    clientCreateLines4.end();
    console.log(result);
    console.log("table 4 completed");
  });

}


function callPython(number,tidNumber){
  console.log("Gonna call the script now");
  if(number == 1)
    return spawn('python',["-u",'./public/python/joinTracks-1.py']);
  else if (number == 2)
    return spawn('python',["-u",'./public/python/separate_tracks-2.py']);
  else if (number == 3)
    return spawn('python',["-u",'./public/python/delete_Same_time_Points-3.py']);
  else if (number == 4)
    return spawn('python',["-u",'./public/python/delete_Stop_Points-4.py']);
  else if (number == 5)
    return spawn('python',["-u",'./public/python/delete1Point-5.py']);
  else if (number == 6)
    return spawn('python',["-u",'./public/python/Create_Tracks-6.py']);
  else if (number == 7)
    return spawn('python',["-u",'./public/python/txtJoinPosition-7.py', tidNumber]);
  else
    console.log("something is wrong, the number is wrong :S");
}
