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
const os =  require('os')
const path = require('path');
const parse = require('postgres-interval') //intervals from postgres to nodejs string

const fs = require('fs');
const csv = require("fast-csv");

var app = express();

/* PostgreSQL and PostGIS module and connection setup */
const { Client, Query } = require('pg')

let isWindows = (os.platform() === 'win32');

//root of server 
var appDir = path.dirname(require.main.filename);
console.log(appDir);
//Create db script
let databaseCreation = "template_postgis";
// Setup connection
let username = "postgres" // sandbox username
let password = "postgres" // read only privileges on our table
let host = "localhost:5432"
let database = "taxi_beij" // database name
let conString = "postgres://"+username+":"+password+"@"+host+"/"+database; // Your Database Connection
let conString0 = "postgres://"+username+":"+password+"@"+host+"/"+databaseCreation; // Your Database Connection

// Set up your database query to display GeoJSON
let drawLines = "SELECT row_to_json(fc) FROM (	SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (	SELECT 'Feature' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((taxi_id,data_time)) As properties FROM tracks As lg LIMIT 1) 	As f) As fc ";

/*let drawTracks = "SELECT row_to_json(fc) FROM
                    (SELECT 'ID_Track' As type,array_to_json(array_agg(track_list)) As features FROM
                      (SELECT 'Trajectoria' As type, array_to_json(array_agg(track_indi)) As features FROM
                        (SELECT 'Ponto' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((taxi_id,data_time)) As properties FROM tracks As lg LIMIT 1500000)
                      As track_indi)
                    As track_list)
                  As fc ";*/

let drawTracks    = "SELECT row_to_json(fc) FROM (SELECT 'Trajectoria' As type, array_to_json(array_agg(track_indi)) As features FROM (SELECT 'P' As type, ST_AsGeoJSON(lg.geomline)::json As geometry, row_to_json((lg.taxi_id,lg.data_time)) As properties FROM (SELECT taxi_id, data_time FROM trajectory_lines GROUP BY taxi_id,data_time ORDER BY taxi_id,data_time) As t JOIN trajectory_lines As lg ON lg.taxi_id = t.taxi_id AND lg.data_time = t.data_time LIMIT 1400000) As track_indi ) As fc ";
let drawTracksMap ="SELECT row_to_json(fc) FROM (	SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (	SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM trajectory_lines3 As lg LIMIT 10000) 	As f) As fc ";

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


let select_first = "SELECT taxi_id from (SELECT taxi_id,row_number() as rn,count(*) over () as total_countFROM tracks) t where rn = 1 or rn = total_count";


/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/
/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/

// 1 degree = 60 * 1852 meters = 111.120 kilometers
// ST_DWithin geom geom, distance (in units of sgrid)--- should be meters but it aint, 0.0009 == 100meters sort of


let activeQuery = "";


/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/
/* QUERIES TO UTILIZE ON LENSES MECHANISMS*/



/* GET home page. */
router.get('/', function(req, res, next) {
  res.render('index', { title: 'Express' });
});

module.exports = router;

/* GET Postgres JSON data */
router.get('/data', function (req, res) {
  let client = new Client(conString);
  client.connect();
  let query = client.query(new Query(drawTracksMap));
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  query.on("end", function (result) {
      let fs = require('fs');
      fs.writeFileSync('./public/data/geoJSON.json', JSON.stringify(result.rows[0].row_to_json));
      res.send(result.rows[0].row_to_json);
      res.end();
  });
});

/* GET the map page */
let timeB4draw = Math.floor( new Date().getTime()/1000);
router.get('/map', function(req, res) {
  mapFirst(res)
});

function mapFirst(res){
  let client0 = new Client(conString0); // Setup our Postgres Client
  client0.connect(); // connect to the client
  console.log("Connected to template_postgis");
  let checkIfDBExists = "SELECT datname FROM pg_catalog.pg_database WHERE datname = 'taxi_beij'";
  client0.query(new Query(checkIfDBExists)).on("end",function(result, err){
    if(result.rowCount != 1){
      client0.query(new Query("CREATE DATABASE taxi_beij")).on("end",function(err){
        if (err)  {
          console.log('DB already exists');
        } // ignore if the db is there

        client0.end(); // close the connection
        console.log("Disconnected from template_postgis");
        startMap( res);
      });
    }
    else{
      startMap( res);
    }
  }); // create user's db
}

function startMap( res){
  let client = new Client(conString); // Setup our Postgres Client
  let client1 = new Client(conString);
  let client2 = new Client(conString);
  let client3 = new Client(conString);
  let client4 = new Client(conString);
  client.connect(); // connect to the client
  client1.connect();
  client2.connect();
  client3.connect();
  client4.connect();
  console.log("New client connected to new taxi_beij");

  let createPostgisExt = "CREATE EXTENSION IF NOT EXISTS postgis;CREATE EXTENSION IF NOT EXISTS postgis_topology;"
  let createDB =  "CREATE TABLE IF NOT EXISTS public.track_divided_by_time_30s(taxi_id integer,long double precision,lat double precision,data_time timestamp without time zone,vel double precision,traj_id integer,start_long double precision,start_lat double precision,end_long double precision,end_lat double precision,tid integer,geom geometry(Point,4326),startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),linegeom geometry(LineString,4326)) WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.track_divided_by_time_30s OWNER to postgres;GRANT ALL ON TABLE public.track_divided_by_time_30s TO postgres; CREATE INDEX IF NOT EXISTS linegeom_trackdivUpload ON public.track_divided_by_time_30s USING gist (linegeom) TABLESPACE pg_default; CREATE INDEX IF NOT EXISTS tid_indexUpload ON public.track_divided_by_time_30s USING btree (tid) TABLESPACE pg_default;";
  let createDB1 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist ON public.trajectory_lines USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist ON public.trajectory_lines USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist ON public.trajectory_lines USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index ON public.trajectory_lines USING btree (track_id) TABLESPACE pg_default;"
  let createDB2 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines1(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines1 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines1 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist1 ON public.trajectory_lines1 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist1 ON public.trajectory_lines1 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist1 ON public.trajectory_lines1 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index1 ON public.trajectory_lines1 USING btree (track_id) TABLESPACE pg_default;"
  let createDB3 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines2(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines2 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines2 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist2 ON public.trajectory_lines2 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist2 ON public.trajectory_lines2 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist2 ON public.trajectory_lines2 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index2 ON public.trajectory_lines2 USING btree (track_id) TABLESPACE pg_default;"
  let createDB4 = "CREATE TABLE IF NOT EXISTS public.trajectory_lines3(track_id integer,geom geometry(LineString,4326),data_time_start timestamp without time zone,data_time_end timestamp without time zone,startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),veloc_avg double precision,duration interval,length double precision,vel double precision[])WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.trajectory_lines3 OWNER to postgres;GRANT ALL ON TABLE public.trajectory_lines3 TO postgres;CREATE INDEX IF NOT EXISTS lineindexgist3 ON public.trajectory_lines3 USING gist (geom) TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointendindexgist3 ON public.trajectory_lines3 USING gist (endpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS pointstartindexgist3 ON public.trajectory_lines3 USING gist(startpointgeom)TABLESPACE pg_default;CREATE INDEX IF NOT EXISTS trackid_index3 ON public.trajectory_lines3 USING btree (track_id) TABLESPACE pg_default;"
  client.query(new Query(createPostgisExt)).on("end",function(err){
      if(err){
        console.log("Extentions already existed");
      }
      console.log("Extentions created");
      let createAllDBs = client.query(new Query(createDB));
      let createAllDBs1 = client1.query(new Query(createDB1));
      let createAllDBs2 = client2.query(new Query(createDB2));
      let createAllDBs3 = client3.query(new Query(createDB3));
      let createAllDBs4 = client4.query(new Query(createDB4));
      createAllDBs.on("end",function(){
        console.log("Table track_divided_by_time_30s created");
        client.end();
      })
      createAllDBs1.on("end",function(){
        console.log("Table trajectory_lines created");
        client1.end();
      })
      createAllDBs2.on("end",function(){
        console.log("Table trajectory_lines1 created");
        client2.end();
      })
      createAllDBs3.on("end",function(){
        console.log("Table trajectory_lines2 created");
        client3.end();
      })
      createAllDBs4.on("end",function(){
        client4.end();
        activeQuery = "";
        console.log("Table trajectory_lines3 created");
        clientFetchFirst = new Client(conString); // Setup our Postgres Client
        clientFetchFirst.connect(); // connect to the client
        console.log("Fetching on database");

        ////TODO METER TEMPO AQUI
        let timeBeforeQueryMadeToDB = new Date();

        let queryFinal = clientFetchFirst.query(new Query(drawTracksMap)); // Run our Query
        queryFinal.on("row", function (row, result) {
            result.addRow(row);
        });

        let clientCSV = new Client(conString);
        clientCSV.connect();
        let newPath
        //console.log(appDir);

        newPath =replaceGlobally(appDir,"bin","public")
        
        
        let newPathVelocity = newPath + "/activeCSV/velocity.csv"
        let newPathLength = newPath + "/activeCSV/length.csv"
        let newPathDuration = newPath + "/activeCSV/duration.csv"
        let newPathTime = newPath + "/activeCSV/time.csv"
        
        let contador = 0
        let queryVelCSV = clientCSV.query(new Query("COPY (SELECT g.veloc_avg FROM trajectory_lines3 AS g ORDER BY g.veloc_avg ASC) TO '"+ newPathVelocity + "' DELIMITER ';' CSV HEADER"))
        queryVelCSV.on("end", function (result) {
          //console.log("Velocity csv ended")
          contador += 1
          if (contador == 4)
            clientCSV.end()
            contador=0
        });
        let queryLenCSV = clientCSV.query(new Query("COPY (SELECT g.length AS len FROM trajectory_lines3 AS g ORDER BY g.length ASC) TO '"+ newPathLength + "' DELIMITER ';' CSV HEADER"))
        queryLenCSV.on("end", function (result) {
          //console.log("Length csv ended")
          contador += 1
          if (contador == 4)
            clientCSV.end()
            contador=0
        });
        let queryDurCSV = clientCSV.query(new Query("COPY (SELECT g.duration FROM trajectory_lines3 AS g ORDER BY g.duration ASC) TO '"+ newPathDuration + "' DELIMITER ';' CSV HEADER"))
        queryDurCSV.on("end", function (result) {
          //console.log("Duration csv ended")
          contador += 1
          if (contador == 4)
            clientCSV.end()
            contador=0
        });
        let queryTimeCSV = clientCSV.query(new Query("COPY (SELECT g.data_time_start FROM trajectory_lines3 AS g ORDER BY g.data_time_start ASC) TO '"+ newPathTime + "' DELIMITER ';' CSV HEADER"))
        queryTimeCSV.on("end", function (result) {
          console.log("Time start csv ended")
          contador += 1
          if (contador == 4)
            clientCSV.end()
            contador=0
        });
        let timefetch = Math.floor( new Date().getTime()/1000);
        let timeafterGet = timefetch-timeB4draw;

        // Pass the result to the map page
        queryFinal.on("end", function (result) {
            console.log(result)
            console.log("Passing data to frontend");
            //let data = require('../public/data/geoJSON.json')

            //TODO  METER TEMPO AQUI
            //VER DIFERENCA
            let timeAfterQueryMadeToDB = new Date();
            console.log("Here comes the time difference")
            console.log((timeAfterQueryMadeToDB - timeBeforeQueryMadeToDB)/1000)

            let data = result.rows[0].row_to_json // Save the JSON as variable data
            //console.log(data)
            res.render('map', {
                title: "BigGeo", // Give a title to our page
                jsonData: data // Pass data to the View
            });
            clientFetchFirst.end();

        });
      })



    });
}

router.post('/query/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {


  //Radius in meters to degrees
  let radiusDegrees = (req.params.radius/ 111120).toFixed(8);

  //let minDegrees = req.params.minValue/ 111120;

  let client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  
  var queryToCreate = query_args_ContructorQUERIES(req.params.tab, req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue)
  
  let data = req.body;
  let stDiffs = "geom";
  let queryOfDiff = "";
  let queryOfRest = "";

  let clientCSV = new Client(conString);
  clientCSV.connect();
  let newPath
  console.log(appDir);

  newPath =replaceGlobally(appDir,"bin","public")
  let tabNumber = req.params.tab.slice(-1);
  if(tabNumber == "s") tabNumber = "";
  
  let newPathVelocity = newPath + "/activeCSV/velocity"+ tabNumber +".csv"
  let newPathLength = newPath + "/activeCSV/length"+ tabNumber +".csv"
  let newPathDuration = newPath + "/activeCSV/duration"+ tabNumber +".csv"
  let newPathTime = newPath + "/activeCSV/time"+ tabNumber +".csv"
  
  let contador = 0
  let queryVelCSV = clientCSV.query(new Query("COPY (SELECT g.veloc_avg FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.veloc_avg ASC) TO '"+ newPathVelocity + "' DELIMITER ';' CSV HEADER"))
  queryVelCSV.on("end", function (result) {
    console.log("Velocity csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryLenCSV = clientCSV.query(new Query("COPY (SELECT g.length AS len FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.length ASC) TO '"+ newPathLength + "' DELIMITER ';' CSV HEADER"))
  queryLenCSV.on("end", function (result) {
    console.log("Length csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryDurCSV = clientCSV.query(new Query("COPY (SELECT g.duration FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.duration ASC) TO '"+ newPathDuration + "' DELIMITER ';' CSV HEADER"))
  queryDurCSV.on("end", function (result) {
    console.log("Duration csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryTimeCSV = clientCSV.query(new Query("COPY (SELECT g.data_time_start FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.data_time_start ASC) TO '"+ newPathTime + "' DELIMITER ';' CSV HEADER"))
  queryTimeCSV.on("end", function (result) {
    console.log("Time start csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  if (activeQuery.length == 0){
    queryOfDiff = " WHERE ";
    queryOfRest = " WHERE ";
  }

  for(let i = 0;i<data.areasArray.length;i++){
    stDiffs = "ST_Difference("+stDiffs+",ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))"
    if(queryOfDiff == " WHERE " && queryOfRest == " WHERE "){
      queryOfDiff = queryOfDiff + "(ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
      queryOfRest = queryOfRest + "NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
    }
    else{
      if(i == 0){
        queryOfDiff = queryOfDiff + " AND (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }
      else{
        queryOfDiff = queryOfDiff + " OR ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }

    }
  }
  queryOfDiff = queryOfDiff + ")";
  queryOfRest = queryOfRest + ")";
  let firstSelect = "SELECT " +  stDiffs + " AS geom FROM " + req.params.tab;
  let secondSelect = "SELECT geom AS geom FROM " + req.params.tab;

  let firstPart = ""
  let secondPart = " LIMIT 5000000) 	As kb) As fc";
  if (data.areasArray.length == 0){
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" + secondSelect + activeQuery + ") As lg";

  }
  else{
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" +firstSelect + activeQuery + queryOfDiff + " UNION ALL " + secondSelect + activeQuery + queryOfRest + ") As lg";

  }
  console.log(firstPart);

  let query = client.query(new Query(firstPart + secondPart)); // Run our Query



  query.on("row", function (row, result) {
      result.addRow(row);
  });

  let timefetch = Math.floor( new Date().getTime()/1000);
  let timeafterGet = timefetch-timeB4draw;
  // Pass the result to the map page
  query.on("end", function (result) {
      //let data = require('../public/data/geoJSON.json')
      let dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      let timeAdraw = Math.floor( new Date().getTime()/1000);
      client.end();
  });

});


router.post('/attQueryNEW/:tab/:geom', function(req, res) {

  //let minDegrees = req.params.minValue/ 111120;
  let array = req.body;
  let clientATT = new Client(conString); // Setup our Postgres Client
  clientATT.connect(); // connect to the client
  let queryAtt = clientATT.query(new Query(query_args_ContructorATTQUERIESCUTOpacLens(req.params.tab, req.params.geom, array))); // Run our Query
  queryAtt.on("row", function (row, result) {
      result.addRow(row);
  });

  // Pass the result to the map page
  queryAtt.on("end", function (result) {
      //let data = require('../public/data/geoJSON.json')
      let dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      clientATT.end();
  });

});

router.get('/queryRemoval/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {


  //Radius in meters to degrees
  let radiusDegrees = (req.params.radius/ 111120).toFixed(8);

   // Setup our Postgres Client
  let client1 = new Client(conString); 
   // connect to the client
  client1.connect();
  let timeBeforeQueryMadeToDB = new Date();
  let query = client1.query(new Query(query_args_DecontructorQUERIES(req.params.tab,req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue))); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  
  let clientCSV = new Client(conString);
  clientCSV.connect();
  let newPath
  console.log(appDir);

  newPath =replaceGlobally(appDir,"bin","public")
  let tabNumber = req.params.tab.slice(-1);
  if(tabNumber == "s") tabNumber = "";
  
  let newPathVelocity = newPath + "/activeCSV/velocity"+ tabNumber +".csv"
  let newPathLength = newPath + "/activeCSV/length"+ tabNumber +".csv"
  let newPathDuration = newPath + "/activeCSV/duration"+ tabNumber +".csv"
  let newPathTime = newPath + "/activeCSV/time"+ tabNumber +".csv"
  
  let contador = 0
  let queryVelCSV = clientCSV.query(new Query("COPY (SELECT g.veloc_avg FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.veloc_avg ASC) TO '"+ newPathVelocity + "' DELIMITER ';' CSV HEADER"))
  queryVelCSV.on("end", function (result) {
    console.log("Velocity csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryLenCSV = clientCSV.query(new Query("COPY (SELECT g.length AS len FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.length ASC) TO '"+ newPathLength + "' DELIMITER ';' CSV HEADER"))
  queryLenCSV.on("end", function (result) {
    console.log("Length csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryDurCSV = clientCSV.query(new Query("COPY (SELECT g.duration FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.duration ASC) TO '"+ newPathDuration + "' DELIMITER ';' CSV HEADER"))
  queryDurCSV.on("end", function (result) {
    console.log("Duration csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryTimeCSV = clientCSV.query(new Query("COPY (SELECT g.data_time_start FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.data_time_start ASC) TO '"+ newPathTime + "' DELIMITER ';' CSV HEADER"))
  queryTimeCSV.on("end", function (result) {
    console.log("Time start csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });



  let timefetch = Math.floor( new Date().getTime()/1000);
  let timeafterGet = timefetch-timeB4draw;
  // Pass the result to the map page
  query.on("end", function (result) {
      //let data = require('../public/data/geoJSON.json')
      let dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      let timeAfterQueryMadeToDB = new Date();
      console.log("Here comes the time difference")
      console.log((timeAfterQueryMadeToDB - timeBeforeQueryMadeToDB)/1000)
      let timeAdraw = Math.floor( new Date().getTime()/1000);
      client1.end();
  });

});


let contToRemove = 0 //when 2 place back at 0 so that it can clean again

router.post('/queryMoved/:tab/:long/:lat/:radius/:type/:minValue/:maxValue/:longNEW/:latNEW/:radiusNEW/:typeNEW/:minValueNEW/:maxValueNEW', function(req, res) {
  let data = req.body;
  //Radius in meters to degrees
  let radiusDegrees = (req.params.radius/ 111120).toFixed(8);
  let radiusDegreesNEW = (req.params.radiusNEW/ 111120).toFixed(8);



  let client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  //DELETE OLD QUERY OF THE LENS
  console.log("Here is the query before any removals")
  console.log(activeQuery)
  if(contToRemove == 0){
    contToRemove += 1
    let deleteOldPos = query_args_DecontructorQUERIES(req.params.tab,req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue);
    let newQuery = query_args_ContructorQUERIES(req.params.tab,req.params.longNEW, req.params.latNEW, radiusDegreesNEW, req.params.typeNEW, req.params.minValueNEW, req.params.maxValueNEW);
  }
  else {
    contToRemove += 1
    if(contToRemove == 4)
      contToRemove = 0
  }
  console.log("After")
  console.log(activeQuery)
  let clientCSV = new Client(conString);
  clientCSV.connect();
  let newPath
  console.log(appDir);

  newPath =replaceGlobally(appDir,"bin","public")
  let tabNumber = req.params.tab.slice(-1);
  if(tabNumber == "s") tabNumber = "";
  
  let newPathVelocity = newPath + "/activeCSV/velocity"+ tabNumber +".csv"
  let newPathLength = newPath + "/activeCSV/length"+ tabNumber +".csv"
  let newPathDuration = newPath + "/activeCSV/duration"+ tabNumber +".csv"
  let newPathTime = newPath + "/activeCSV/time"+ tabNumber +".csv"
  
  let contador = 0
  let queryVelCSV = clientCSV.query(new Query("COPY (SELECT g.veloc_avg FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.veloc_avg ASC) TO '"+ newPathVelocity + "' DELIMITER ';' CSV HEADER"))
  queryVelCSV.on("end", function (result) {
    console.log("Velocity csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryLenCSV = clientCSV.query(new Query("COPY (SELECT g.length AS len FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.length ASC) TO '"+ newPathLength + "' DELIMITER ';' CSV HEADER"))
  queryLenCSV.on("end", function (result) {
    console.log("Length csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryDurCSV = clientCSV.query(new Query("COPY (SELECT g.duration FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.duration ASC) TO '"+ newPathDuration + "' DELIMITER ';' CSV HEADER"))
  queryDurCSV.on("end", function (result) {
    console.log("Duration csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });
  let queryTimeCSV = clientCSV.query(new Query("COPY (SELECT g.data_time_start FROM "+ req.params.tab + " AS g " + activeQuery + " ORDER BY g.data_time_start ASC) TO '"+ newPathTime + "' DELIMITER ';' CSV HEADER"))
  queryTimeCSV.on("end", function (result) {
    console.log("Time start csv ended")
    contador += 1
    if (contador == 4){
      clientCSV.end()
      startMergingCSVs([newPath +'/activeCSV/velocity.csv', newPath +'/activeCSV/velocity1.csv',newPath +'/activeCSV/velocity2.csv',newPath +'/activeCSV/velocity3.csv'], newPath +'/activeCSV/velocityFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/length.csv', newPath +'/activeCSV/length1.csv',newPath +'/activeCSV/length2.csv',newPath +'/activeCSV/length3.csv'], newPath +'/activeCSV/lengthFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/duration.csv', newPath +'/activeCSV/duration1.csv',newPath +'/activeCSV/duration2.csv',newPath +'/activeCSV/duration3.csv'], newPath +'/activeCSV/durationFinal.csv').then(() => console.log("i did sometinhg"));
      startMergingCSVs([newPath +'/activeCSV/time.csv', newPath +'/activeCSV/time1.csv',newPath +'/activeCSV/time2.csv',newPath +'/activeCSV/time3.csv'], newPath +'/activeCSV/timeFinal.csv').then(() => console.log("i did sometinhg"));
      //.then(() => ...doStuff);
    }
  });

  let stDiffs = "geom";
  let queryOfDiff = "";
  let queryOfRest = "";
  if (activeQuery.length == 0){
    queryOfDiff = " WHERE ";
    queryOfRest = " WHERE ";
  }

  for(let i = 0;i<data.areasArray.length;i++){
    stDiffs = "ST_Difference("+stDiffs+",ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))"
    if(queryOfDiff == " WHERE " && queryOfRest == " WHERE "){
      queryOfDiff = queryOfDiff + "(ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
      queryOfRest = queryOfRest + "NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
    }
    else{
      if(i == 0){
        queryOfDiff = queryOfDiff + " AND (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }
      else{
        queryOfDiff = queryOfDiff + " OR ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }

    }
  }
  queryOfDiff = queryOfDiff + ")";
  queryOfRest = queryOfRest + ")";
  let firstSelect = "SELECT " +  stDiffs + " AS geom FROM " + req.params.tab;
  let secondSelect = "SELECT geom AS geom FROM " + req.params.tab;

  let firstPart = ""
  let secondPart = " LIMIT 5000000) 	As kb) As fc";
  if (data.areasArray.length == 0){
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" + secondSelect + activeQuery + ") As lg";

  }
  else{
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" +firstSelect + activeQuery + queryOfDiff + " UNION ALL " + secondSelect + activeQuery + queryOfRest + ") As lg";

  }
  console.log(firstPart);

  let query = client.query(new Query(firstPart + secondPart)); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });

  let timefetch = Math.floor( new Date().getTime()/1000);
  let timeafterGet = timefetch-timeB4draw;

  // Pass the result to the map page
  query.on("end", function (result) {
      //let data = require('../public/data/geoJSON.json')
      let dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      let timeAdraw = Math.floor( new Date().getTime()/1000);
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

  let firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM " + tab + " As lg";
  let secondPart = " LIMIT 5000000) 	As f) As fc";
  if (activeQuery.length != 7){
    activeQuery = activeQuery + " AND ";
  }
  if (type == "Default"){
    let queryDB =  "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }

  else if (type == "Start"){

    let queryDB = "ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }

  else if (type == "End"){
    let queryDB = "ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }
  else if (type == "Vel_avg"){


    let queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minValue + ") AND (veloc_avg <=" + maxValue + ")";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }
  else if (type == "Length"){

    let minValDegree = minValue / 111120;
    let maxValDegree = maxValue / 111120;
    let queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }
  else if (type == "Time_Interval"){

    let minValTime = minValue;  //UNIX TIME
    let maxValTime = maxValue;  //UNIX TIME
    let queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + "))";
    if (activeQuery.indexOf(queryDB) !=-1){

      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }

  else if (type == "Time_Duration"){
    let minValTime = minValue;  //UNIX TIME
    let maxValTime = maxValue;  //UNIX TIME
    let queryDB = "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")";
    if (activeQuery.indexOf(queryDB) !=-1){
      activeQuery = activeQuery.slice(0,-5);
      return firstPart + activeQuery + secondPart;
    }
    else{
      activeQuery = activeQuery + queryDB;

      return firstPart + activeQuery + secondPart;
    }
  }
  else{
    return "";}

}
function query_args_ContructorATTQUERIESOLDEST (tab,long, lat, radius){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom
  let withsPart ="WITH trackDivided as ( SELECT tid, vel as velPerPoint, linegeom, data_time FROM track_divided_by_time_30s WHERE ST_DWithin(linegeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")), trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + "), multi as (SELECT trackDivided.tid, array_agg(trackDivided.velPerPoint ORDER BY trackDivided.tid, trackDivided.data_time) as velPerPoint, ST_MakeLine(array_agg(trackDivided.linegeom ORDER BY trackDivided.tid,trackDivided.data_time)) AS linegeom FROM trackDivided, trajectoryLine WHERE trackDivided.tid = trajectoryLine.track_id GROUP BY trackDivided.tid) SELECT multi.linegeom as linegeom, multi.velPerPoint as velPerPoint, trajectoryLine.length as length, trajectoryLine.veloc_avg as veloc_avg, trajectoryLine.duration, trajectoryLine.data_time_End  FROM trajectoryLine , multi WHERE multi.tid = trajectoryLine.track_id";
  let firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.linegeom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.velPerPoint)) As properties FROM (" + withsPart + ") As lg";
  let secondPart = " LIMIT 5000000) 	As f) As fc";

  return firstPart + secondPart;

}

function query_args_ContructorATTQUERIESOLD (tab,geomGeoJson){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom

  let withsPart ="WITH trackDivided as ( SELECT tid,tidsubseg, vel as velPerPoint, linegeom, data_time FROM track_divided_by_time_30s WHERE ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AND ST_Intersects(linegeom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326))), trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + "), prevLag as (SELECT trackDivided.tid as tid,trackDivided.tidsubseg as tidsubseg,trackDivided.velPerPoint, trackDivided.linegeom, trackDivided.data_time,lag(trackDivided.tidsubseg) over (ORDER BY trackDivided.tidsubseg) as idPrev FROM trackDivided), multi as (SELECT prevLag.tid, array_agg(prevLag.velPerPoint ORDER BY prevLag.tid, prevLag.data_time) as velPerPoint, ST_Intersection(ST_MakeLine(array_agg(prevLag.linegeom ORDER BY prevLag.tid,prevLag.data_time)),ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AS linegeom FROM trajectoryLine,prevLag WHERE prevLag.tid = trajectoryLine.track_id AND prevLag.tidsubseg = prevLag.idprev+1 GROUP BY prevLag.tid ) SELECT multi.linegeom as linegeom, multi.velPerPoint as velPerPoint, trajectoryLine.length as length, trajectoryLine.veloc_avg as veloc_avg, trajectoryLine.duration, trajectoryLine.data_time_End  FROM trajectoryLine , multi WHERE multi.tid = trajectoryLine.track_id";
  let firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.linegeom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.velPerPoint)) As properties FROM (" + withsPart + ") As lg";
  let secondPart = " LIMIT 5000000) 	As f) As fc";

  return firstPart + secondPart;

}
function query_args_ContructorATTQUERIESNEW (tab,geomGeoJson){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom

  let withsPart ="WITH trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + "), trajLine_Intersect as (SELECT * FROM trajectoryLine WHERE ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AND ST_Intersects(trajectoryLine.geom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)))  SELECT ST_Intersection(trajLine_Intersect.geom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) as linegeom, trajLine_Intersect.length as length, trajLine_Intersect.veloc_avg as veloc_avg, trajLine_Intersect.duration, trajLine_Intersect.data_time_End  FROM trajLine_Intersect ";
  let firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.linegeom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg)) As properties FROM (" + withsPart + ") As lg";
  let secondPart = " LIMIT 5000000) 	As f) As fc";

  return firstPart + secondPart;

}

function query_args_ContructorATTQUERIESCUTOpacLens (tab,geomGeoJson,array){
  //SELECT tid, array_agg(vel ORDER BY tid, data_time) as velPerPoint, ST_MakeLine(array_agg(linegeom ORDER BY tid,data_time)) AS linegeom

  let stDiffs2 = "intersectionCut.linegeom";

  for(let j = 0;j<array.areasArrayIntersections.length;j++){
    stDiffs2 = "ST_Difference("+stDiffs2+",ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(array.areasArrayIntersections[j]) + "'),4326))"

  }
  console.log(stDiffs2);

  let withsPart ="WITH trajectoryLine as (SELECT * FROM " + tab + " " + activeQuery + ")," +
  " trajLine_Intersect as (SELECT * FROM trajectoryLine WHERE ST_IsValid(ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) AND ST_Intersects(trajectoryLine.geom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)))," +
  " intersectionCut as (  SELECT ST_Intersection(trajLine_Intersect.geom,ST_SetSRID(ST_GeomFromGeoJSON('" + geomGeoJson + "'),4326)) as linegeom, trajLine_Intersect.length as length, trajLine_Intersect.veloc_avg as veloc_avg, trajLine_Intersect.duration, trajLine_Intersect.data_time_End  FROM trajLine_Intersect )" +
  " SELECT " +  stDiffs2 +  " as linegeom, intersectionCut.length as length, intersectionCut.veloc_avg as veloc_avg, intersectionCut.duration, intersectionCut.data_time_End  FROM intersectionCut";
  let firstPart = "SELECT row_to_json(fk) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(k)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(mg.linegeom)::json As geometry, row_to_json((mg.length,mg.duration,mg.data_time_End,mg.veloc_avg)) As properties FROM (" + withsPart + ") As mg";
  let secondPart = " LIMIT 5000000) 	As k) As fk";

  return firstPart + secondPart;

}

router.post('/updateBaseLayer/:tab', (req, res, next) => {
  let data = req.body;
  let stDiffs = "geom";
  let queryOfDiff = "";
  let queryOfRest = "";
  if (activeQuery.length == 0){
    queryOfDiff = " WHERE ";
    queryOfRest = " WHERE ";
  }

  for(let i = 0;i<data.areasArray.length;i++){
    stDiffs = "ST_Difference("+stDiffs+",ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))"
    if(queryOfDiff == " WHERE " && queryOfRest == " WHERE "){
      queryOfDiff = queryOfDiff + "(ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
      queryOfRest = queryOfRest + "NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
    }
    else{
      if(i == 0){
        queryOfDiff = queryOfDiff + " AND (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND NOT (ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }
      else{
        queryOfDiff = queryOfDiff + " OR ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";
        queryOfRest = queryOfRest + " AND ST_Intersects(geom,ST_SetSRID(ST_GeomFromGeoJSON('" + JSON.stringify(data.areasArray[i]) + "'),4326))";

      }

    }
  }
  queryOfDiff = queryOfDiff + ")";
  queryOfRest = queryOfRest + ")";
  let firstSelect = "SELECT " +  stDiffs + " AS geom FROM " + req.params.tab;
  let secondSelect = "SELECT geom AS geom FROM " + req.params.tab;

  let firstPart = ""
  let secondPart = " LIMIT 5000000) 	As kb) As fc";
  if (data.areasArray.length == 0){
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" + secondSelect + activeQuery + ") As lg";

  }
  else{
    firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(kb)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry FROM (" +firstSelect + activeQuery + queryOfDiff + " UNION ALL " + secondSelect + activeQuery + queryOfRest + ") As lg";

  }
  console.log(firstPart);
  let client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  //DELETE OLD QUERY OF THE LENS

  let newQuery = firstPart + secondPart;

  let query = client.query(new Query(newQuery)); // Run our Query
  query.on("row", function (row, result) {
      result.addRow(row);
  });


  // Pass the result to the map page
  query.on("end", function (result) {
      //let data = require('../public/data/geoJSON.json')
      let dataNew = result.rows[0].row_to_json // Save the JSON as variable data
      res.send(dataNew);

      client.end();
  });

});


//
//QUERY DECONSTRUCTORS
//

function replaceGlobally(original, searchTxt, replaceTxt) {
  original = original.split(searchTxt).join(replaceTxt);
  return original;
}

function query_args_DecontructorQUERIES (tab ,long, lat, radius, type, minVal, maxVal){

  let andString = " AND ";
  let firstPart = "SELECT row_to_json(fc) FROM (SELECT 'FeatureCollection' As type, array_to_json(array_agg(f)) As features FROM (SELECT 'Feature' As type, ST_AsGeoJSON(lg.geom)::json As geometry, row_to_json((lg.length,lg.duration,lg.data_time_End,lg.veloc_avg, lg.vel)) As properties FROM " + tab + " As lg";
  let secondPart = " LIMIT 40000) 	As f) As fc";

  if(activeQuery == ""){
      console.log("Query was already empty no need to remove anything")
  }
  else if (type == "Default"){
    let queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

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
    let queryDB = andString + "ST_DWithin(startPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

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
    let queryDB = andString + "ST_DWithin(endPointGeom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ")";

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
    let queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326)," + radius + ") AND (veloc_avg >=" + minVal + ") AND (veloc_avg <=" + maxVal + ")";

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
    let minValDegree = minVal / 111120;
    let maxValDegree = maxVal / 111120;
    let queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (ST_Length(geom) >=" + minValDegree + ") AND (ST_Length(geom) <=" + maxValDegree + ")";

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
    let minValTime = minVal;  //UNIX TIME
    let maxValTime = maxVal;  //UNIX TIME
    let queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + "))";

    console.log("Im on a Time Interval  Lens");
    if (activeQuery.indexOf(queryDB) !=-1){
      console.log("Im on an AND one");
    }
    else if (activeQuery.indexOf("ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + "))") !=-1){
      console.log("Im not on an AND one");
      queryDB ="ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (data_time_start BETWEEN to_timestamp(" + minValTime + ") AND to_timestamp(" +maxValTime + "))";
    }
    else{
      console.log("There was an error as it didnt recognize any of them")
    }

    activeQuery = replaceGlobally(activeQuery, queryDB, "");
    console.log("The active query is:" + activeQuery);
  }
  else if (type == "Time_Duration"){
    let minValTime = minVal;  //UNIX TIME
    let maxValTime = maxVal;  //UNIX TIME
    let queryDB = andString + "ST_DWithin(geom,ST_SetSRID(ST_MakePoint("+ long + "," + lat+ "),4326),"+ radius +") AND (extract(epoch from (data_time_end - data_time_start)) BETWEEN  " + minValTime + " AND " +maxValTime + ")";

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

  let firsGeom = JSON.parse(req.params.firstGeom);
  let secondGeom = JSON.parse(req.params.secondGeom);
  let intersectionVar = intersect.default(firsGeom,secondGeom);
  res.send(JSON.stringify(intersectionVar));


});

router.get('/difference/:firstGeom/:secondGeom', function(req, res) {

  let firsGeom = JSON.parse(req.params.firstGeom);
  let secondGeom = JSON.parse(req.params.secondGeom);
  let differenceVar = difference(firsGeom,secondGeom);
  res.send(JSON.stringify(differenceVar));


});

router.get('/interdif/:firstGeom/:secondGeom', function(req, res) {

  let firstGeom = JSON.parse(req.params.firstGeom);
  let secondGeom = JSON.parse(req.params.secondGeom);
  if(firstGeom != null && secondGeom != null){
    let intersectionVar = turf.intersect(firstGeom,secondGeom);
    let options = {precision: 6, coordinates: 2};
    if(intersectionVar != null){
      let differenceVar = turf.difference(firstGeom,secondGeom);
      let list = [truncate.default(cleancoords.default(intersectionVar),options),truncate.default(cleancoords.default(differenceVar),options)];
      res.send(JSON.stringify(list));
    }
    else{
      console.log("it has a null area")
      res.send(JSON.stringify([null, null]));
    }
  }
  else{
    console.log("One of the geojsons is null")
    res.send(JSON.stringify([null, null]));
  }


});

router.get('/union/:firstGeom/:secondGeom', function(req, res) {
  let firsGeom = JSON.parse(req.params.firstGeom);
  let secondGeom = JSON.parse(req.params.secondGeom);
  let unionVar = union.default(firsGeom,secondGeom);
  res.send(JSON.stringify(unionVar));


});

router.get('/minTimeVarValue', function(req, res) {
  let dataNewMin = Date.now()
  let numberOfConnects = 0;
  let client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  let query = client.query(new Query("SELECT min(data_time_end) FROM trajectory_lines")); // Run our Query
  let query1 = client.query(new Query("SELECT min(data_time_end) FROM trajectory_lines1")); // Run our Query
  let query2 = client.query(new Query("SELECT min(data_time_end) FROM trajectory_lines2")); // Run our Query
  let query3 = client.query(new Query("SELECT min(data_time_end) FROM trajectory_lines3")); // Run our Query


  query.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    console.log(result)
    numberOfConnects = numberOfConnects + 1

    if(dataNewMin > result.rows[0].min && result.rows[0].min != null){
      dataNewMin = result.rows[0].min
    }
    if(numberOfConnects == 4){
      console.log("Here  is the min")
      console.log(dataNewMin)
      client.end();
      if(dataNewMin != null){
        res.status(200).send((dataNewMin).toString());
      }
    }

  });
  query1.on("end", function (result) {
    console.log(result)
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMin > result.rows[0].min && result.rows[0].min != null){
      dataNewMin = result.rows[0].min
    }
    if(numberOfConnects == 4){
      console.log("Here  is the min")
      console.log(dataNewMin)

      client.end();
      if(dataNewMin != null){
        res.status(200).send((dataNewMin).toString());
      }
    }

  });
  query2.on("end", function (result) {
    console.log(result)
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMin > result.rows[0].min && result.rows[0].min != null){
      dataNewMin = result.rows[0].min
    }
    if(numberOfConnects == 4){
      console.log("Here  is the min")
      console.log(dataNewMin)
      client.end();
      if(dataNewMin != null){
        res.status(200).send((dataNewMin).toString());
      }
    }

  });
  query3.on("end", function (result) {
    console.log(result)
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMin > result.rows[0].min && result.rows[0].min != null){
      dataNewMin = result.rows[0].min
    }
    if(numberOfConnects == 4){
      console.log("Here  is the min")
      console.log(dataNewMin)
      client.end();
      if(dataNewMin != null){
        res.status(200).send((dataNewMin).toString());
      }
    }

  });

});

router.get('/maxVel/maxLength/maxTime/maxDuration', function(req, res) {
  let client = new Client(conString); // Setup our Postgres Client
  let numberOfConnects = 0;
  client.connect(); // connect to the client
  let dataNewMaxVel = 0
  let dataNewMaxDur = {"days": 0, "hours":0, "minutes":0, "seconds":0}
  let dataNEWAVGDur = {"days": 0, "hours":0, "minutes":0, "seconds":0}
  let dataNewMaxLen = 0
  let dataNEWAVGLen = 0
  let dataTotal = 0
  let dataNEWAVGVel = 0
  let dataNewMaxTime = new Date(0)
  let dataNewAVGTime = new Date(0)
  let dataNewMinTime = new Date()
  let query = client.query(new Query("SELECT max(veloc_avg) AS veloc_max,AVG(veloc_avg) AS veloc_avg, max(length) AS length, AVG(length) AS length_avg, max(duration) AS duration, max(data_time_start) AS timemax,min(data_time_start) AS timemin,AVG(duration) AS duration_avg, COUNT(*) AS total FROM trajectory_lines" + activeQuery)); // Run our Query
  let query1 = client.query(new Query("SELECT max(veloc_avg) AS veloc_max,AVG(veloc_avg) AS veloc_avg, max(length) AS length, AVG(length) AS length_avg, max(duration) AS duration, max(data_time_start) AS timemax,min(data_time_start) AS timemin,AVG(duration) AS duration_avg, COUNT(*) AS total FROM trajectory_lines1" + activeQuery)); // Run our Query
  let query2 = client.query(new Query("SELECT max(veloc_avg) AS veloc_max,AVG(veloc_avg) AS veloc_avg, max(length) AS length, AVG(length) AS length_avg, max(duration) AS duration, max(data_time_start) AS timemax,min(data_time_start) AS timemin,AVG(duration) AS duration_avg, COUNT(*) AS total FROM trajectory_lines2" + activeQuery)); // Run our Query
  let query3 = client.query(new Query("SELECT max(veloc_avg) AS veloc_max,AVG(veloc_avg) AS veloc_avg, max(length) AS length, AVG(length) AS length_avg, max(duration) AS duration, max(data_time_start) AS timemax,min(data_time_start) AS timemin,AVG(duration) AS duration_avg, COUNT(*) AS total FROM trajectory_lines3" + activeQuery)); // Run our Query

  query.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(result != null){
      let thisTotal = +result.rows[0].total
      //dataNewAVGTime = (dataNewAVGTime*dataTotal + thisTotal*result.rows[0].duration_avg)/(dataTotal + thisTotal)
      if(result.rows[0].veloc_avg != null) dataNEWAVGVel = (dataNEWAVGVel*dataTotal + thisTotal*result.rows[0].veloc_avg)/(dataTotal + thisTotal)
      if(result.rows[0].length_avg != null) dataNEWAVGLen = (dataNEWAVGLen*dataTotal + thisTotal*result.rows[0].length_avg)/(dataTotal + thisTotal)


      console.log(result.rows[0].duration_avg)
      if(result.rows[0].duration_avg != null){
        if (result.rows[0].duration_avg.hours != null || result.rows[0].duration_avg.hours != undefined )
          dataNEWAVGDur.hours = Math.floor((dataNEWAVGDur.hours*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.hours)))/(dataTotal + thisTotal)) //i know it isnt like this but time is running out.
        if (result.rows[0].duration_avg.minutes != null || result.rows[0].duration_avg.minutes != undefined )
          dataNEWAVGDur.minutes = Math.floor((dataNEWAVGDur.minutes*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.minutes)))/(dataTotal + thisTotal))
        if (result.rows[0].duration_avg.seconds != null || result.rows[0].duration_avg.seconds != undefined )
          dataNEWAVGDur.seconds = Math.floor((dataNEWAVGDur.seconds*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.seconds)))/(dataTotal + thisTotal))
      }
      console.log(dataNEWAVGDur)

      if(dataNEWAVGDur.seconds == 0 ) {dataNEWAVGDur.seconds = "00"} //ik its bad
      else if(dataNEWAVGDur.seconds >= 60 ) {dataNEWAVGDur.seconds = "00"; dataNEWAVGDur.minutes += 1} //ik its bad
      else if(dataNEWAVGDur.seconds < 10 ) {dataNEWAVGDur.seconds = "0"+dataNEWAVGDur.seconds}
      if(dataNEWAVGDur.minutes == 0 ) {dataNEWAVGDur.minutes = "00"} //ik its bad
      else if(dataNEWAVGDur.minutes >= 60 ) {dataNEWAVGDur.minutes = "00"; dataNEWAVGDur.hours += 1}
      else if(dataNEWAVGDur.minutes < 10 ) {dataNEWAVGDur.minutes = "0"+dataNEWAVGDur.minutes}
      if(dataNEWAVGDur.hours == 0 ) {dataNEWAVGDur.hours = "00"} //ik its bad
      else if(dataNEWAVGDur.hours >= 24) dataNEWAVGDur.hours = "23" //ik ik
      else if(dataNEWAVGDur.hours < 10 ) {dataNEWAVGDur.hours = "0"+dataNEWAVGDur.hours}
      dataTotal = dataTotal + thisTotal;
      
      if(dataNewMaxVel < result.rows[0].veloc_max && result.rows[0].veloc_max != null){
        dataNewMaxVel = result.rows[0].veloc_max
      }
      let intervalVar = result.rows[0].duration

      console.log(result.rows[0].duration)
      if(result.rows[0].duration!= null){
        if(!(result.rows[0].duration.days === 'undefined')){
          if(dataNewMaxDur.days <  intervalVar.days)  {dataNewMaxDur.days =  intervalVar.days
          dataNewMaxDur.hours =  intervalVar.hours
          dataNewMaxDur.minutes =  intervalVar.minutes
          dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.hours === 'undefined')){
          if(dataNewMaxDur.hours <  intervalVar.hours && dataNewMaxDur.days == 0)  {
            dataNewMaxDur.hours =  intervalVar.hours
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.minutes === 'undefined')){
          if(dataNewMaxDur.minutes <  intervalVar.minutes && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0)  {
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.seconds === 'undefined')){
          if(dataNewMaxDur.seconds <  intervalVar.seconds  && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0 && dataNewMaxDur.minutes == 0)  {
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
      }
      if(dataNewMaxLen < result.rows[0].length && result.rows[0].length != null){
        dataNewMaxLen = result.rows[0].length
      }
      console.log(dataNewMaxTime)
      console.log(result.rows[0].timemax)
      if(dataNewMaxTime < new Date(result.rows[0].timemax) && result.rows[0].timemax != null){
        dataNewMaxTime = new Date(result.rows[0].timemax)
      }

      console.log(dataNewMinTime)
      console.log(result.rows[0].timemin)
      if(dataNewMinTime > new Date(result.rows[0].timemin) && result.rows[0].timemin != null){
        dataNewMinTime = new Date(result.rows[0].timemin)
      }
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")  //,"timeavg":dataNewAVGTime
      let maxArrayValues = {"totalTracks": dataTotal, "velocity": dataNewMaxVel,"velocity_avg":dataNEWAVGVel, "duration": dataNewMaxDur,"duration_avg":dataNEWAVGDur, "length":dataNewMaxLen,"length_avg":dataNEWAVGLen ,"timemax": dataNewMaxTime, "timemin": dataNewMinTime }
      console.log(maxArrayValues)
      client.end();
      if(maxArrayValues != null){
        res.status(200).send(JSON.stringify(maxArrayValues));
      }
    }
  });
  query1.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(result != null){
      let thisTotal = +result.rows[0].total
      //dataNewAVGTime = (dataNewAVGTime*dataTotal + thisTotal*result.rows[0].duration_avg)/(dataTotal + thisTotal)
      if(result.rows[0].veloc_avg != null) dataNEWAVGVel = (dataNEWAVGVel*dataTotal + thisTotal*result.rows[0].veloc_avg)/(dataTotal + thisTotal)
      if(result.rows[0].length_avg != null) dataNEWAVGLen = (dataNEWAVGLen*dataTotal + thisTotal*result.rows[0].length_avg)/(dataTotal + thisTotal)


      console.log(result.rows[0].duration_avg)
      if(result.rows[0].duration_avg != null){
        if (result.rows[0].duration_avg.hours != null || result.rows[0].duration_avg.hours != undefined )
          dataNEWAVGDur.hours = Math.floor((dataNEWAVGDur.hours*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.hours)))/(dataTotal + thisTotal)) //i know it isnt like this but time is running out.
        if (result.rows[0].duration_avg.minutes != null || result.rows[0].duration_avg.minutes != undefined )
          dataNEWAVGDur.minutes = Math.floor((dataNEWAVGDur.minutes*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.minutes)))/(dataTotal + thisTotal))
        if (result.rows[0].duration_avg.seconds != null || result.rows[0].duration_avg.seconds != undefined )
          dataNEWAVGDur.seconds = Math.floor((dataNEWAVGDur.seconds*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.seconds)))/(dataTotal + thisTotal))
      }console.log(dataNEWAVGDur)

      if(dataNEWAVGDur.seconds == 0 ) {dataNEWAVGDur.seconds = "00"} //ik its bad
      else if(dataNEWAVGDur.seconds >= 60 ) {dataNEWAVGDur.seconds = "00"; dataNEWAVGDur.minutes += 1} //ik its bad
      else if(dataNEWAVGDur.seconds < 10 ) {dataNEWAVGDur.seconds = "0"+dataNEWAVGDur.seconds}
      if(dataNEWAVGDur.minutes == 0 ) {dataNEWAVGDur.minutes = "00"} //ik its bad
      else if(dataNEWAVGDur.minutes >= 60 ) {dataNEWAVGDur.minutes = "00"; dataNEWAVGDur.hours += 1}
      else if(dataNEWAVGDur.minutes < 10 ) {dataNEWAVGDur.minutes = "0"+dataNEWAVGDur.minutes}
      if(dataNEWAVGDur.hours == 0 ) {dataNEWAVGDur.hours = "00"} //ik its bad
      else if(dataNEWAVGDur.hours >= 24) dataNEWAVGDur.hours = "23" //ik ik
      else if(dataNEWAVGDur.hours < 10 ) {dataNEWAVGDur.hours = "0"+dataNEWAVGDur.hours}
      
      dataTotal = dataTotal + thisTotal;
      

      if(dataNewMaxVel < result.rows[0].veloc_max && result.rows[0].veloc_max != null){
        dataNewMaxVel = result.rows[0].veloc_max
      }
      let intervalVar = result.rows[0].duration
      
      console.log(result.rows[0].duration)
      if(result.rows[0].duration!= null){
        if(!(result.rows[0].duration.days === 'undefined')){
          if(dataNewMaxDur.days <  intervalVar.days)  {dataNewMaxDur.days =  intervalVar.days
          dataNewMaxDur.hours =  intervalVar.hours
          dataNewMaxDur.minutes =  intervalVar.minutes
          dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.hours === 'undefined')){
          if(dataNewMaxDur.hours <  intervalVar.hours && dataNewMaxDur.days == 0)  {
            dataNewMaxDur.hours =  intervalVar.hours
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.minutes === 'undefined')){
          if(dataNewMaxDur.minutes <  intervalVar.minutes && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0)  {
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.seconds === 'undefined')){
          if(dataNewMaxDur.seconds <  intervalVar.seconds  && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0 && dataNewMaxDur.minutes == 0)  {
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
      }
      if(dataNewMaxLen < result.rows[0].length && result.rows[0].length != null){
        dataNewMaxLen = result.rows[0].length
      }
      console.log(dataNewMaxTime)
      console.log(result.rows[0].timemax)
      if(dataNewMaxTime < new Date(result.rows[0].timemax) && result.rows[0].timemax != null){
        dataNewMaxTime = new Date(result.rows[0].timemax)
      }
      if(dataNewMinTime > new Date(result.rows[0].timemin) && result.rows[0].timemin != null){
        dataNewMinTime = new Date(result.rows[0].timemin)
      }
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      let maxArrayValues = {"totalTracks": dataTotal, "velocity": dataNewMaxVel,"velocity_avg":dataNEWAVGVel,"duration": dataNewMaxDur,"duration_avg":dataNEWAVGDur, "length":dataNewMaxLen,"length_avg":dataNEWAVGLen ,"timemax": dataNewMaxTime, "timemin": dataNewMinTime }
      console.log(maxArrayValues)
      client.end();
      if(maxArrayValues!= null){
        res.status(200).send(JSON.stringify(maxArrayValues));
      }
    }

  });
  query2.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(result != null){
      let thisTotal = +result.rows[0].total
      //dataNewAVGTime = (dataNewAVGTime*dataTotal + thisTotal*result.rows[0].duration_avg)/(dataTotal + thisTotal)
      if(result.rows[0].veloc_avg != null) dataNEWAVGVel = (dataNEWAVGVel*dataTotal + thisTotal*result.rows[0].veloc_avg)/(dataTotal + thisTotal)
      if(result.rows[0].length_avg != null) dataNEWAVGLen = (dataNEWAVGLen*dataTotal + thisTotal*result.rows[0].length_avg)/(dataTotal + thisTotal)


      console.log(result.rows[0].duration_avg)
      if(result.rows[0].duration_avg != null){
        if (result.rows[0].duration_avg.hours != null || result.rows[0].duration_avg.hours != undefined )
          dataNEWAVGDur.hours = Math.floor((dataNEWAVGDur.hours*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.hours)))/(dataTotal + thisTotal)) //i know it isnt like this but time is running out.
        if (result.rows[0].duration_avg.minutes != null || result.rows[0].duration_avg.minutes != undefined )
          dataNEWAVGDur.minutes = Math.floor((dataNEWAVGDur.minutes*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.minutes)))/(dataTotal + thisTotal))
        if (result.rows[0].duration_avg.seconds != null || result.rows[0].duration_avg.seconds != undefined )
          dataNEWAVGDur.seconds = Math.floor((dataNEWAVGDur.seconds*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.seconds)))/(dataTotal + thisTotal))
      }console.log(dataNEWAVGDur)

      if(dataNEWAVGDur.seconds == 0 ) {dataNEWAVGDur.seconds = "00"} //ik its bad
      else if(dataNEWAVGDur.seconds >= 60 ) {dataNEWAVGDur.seconds = "00"; dataNEWAVGDur.minutes += 1} //ik its bad
      else if(dataNEWAVGDur.seconds < 10 ) {dataNEWAVGDur.seconds = "0"+dataNEWAVGDur.seconds}
      if(dataNEWAVGDur.minutes == 0 ) {dataNEWAVGDur.minutes = "00"} //ik its bad
      else if(dataNEWAVGDur.minutes >= 60 ) {dataNEWAVGDur.minutes = "00"; dataNEWAVGDur.hours += 1}
      else if(dataNEWAVGDur.minutes < 10 ) {dataNEWAVGDur.minutes = "0"+dataNEWAVGDur.minutes}
      if(dataNEWAVGDur.hours == 0 ) {dataNEWAVGDur.hours = "00"} //ik its bad
      else if(dataNEWAVGDur.hours >= 24) dataNEWAVGDur.hours = "23" //ik ik
      else if(dataNEWAVGDur.hours < 10 ) {dataNEWAVGDur.hours = "0"+dataNEWAVGDur.hours}
      dataTotal = dataTotal + thisTotal;
      

      if(dataNewMaxVel < result.rows[0].veloc_max && result.rows[0].veloc_max != null){
        dataNewMaxVel = result.rows[0].veloc_max
      }
      let intervalVar = result.rows[0].duration
      
      console.log(result.rows[0].duration)
      if(result.rows[0].duration!= null){
        if(!(result.rows[0].duration.days === 'undefined')){
          if(dataNewMaxDur.days <  intervalVar.days)  {dataNewMaxDur.days =  intervalVar.days
          dataNewMaxDur.hours =  intervalVar.hours
          dataNewMaxDur.minutes =  intervalVar.minutes
          dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.hours === 'undefined')){
          if(dataNewMaxDur.hours <  intervalVar.hours && dataNewMaxDur.days == 0)  {
            dataNewMaxDur.hours =  intervalVar.hours
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.minutes === 'undefined')){
          if(dataNewMaxDur.minutes <  intervalVar.minutes && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0)  {
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.seconds === 'undefined')){
          if(dataNewMaxDur.seconds <  intervalVar.seconds  && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0 && dataNewMaxDur.minutes == 0)  {
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
      }
      if(dataNewMaxLen < result.rows[0].length && result.rows[0].length != null){
        dataNewMaxLen = result.rows[0].length
      }
      console.log(dataNewMaxTime)
      console.log(result.rows[0].timemax)
      if(dataNewMaxTime < new Date(result.rows[0].timemax) && result.rows[0].timemax != null){
        dataNewMaxTime = new Date(result.rows[0].timemax)
      }
      if(dataNewMinTime > new Date(result.rows[0].timemin) && result.rows[0].timemin != null){
        dataNewMinTime = new Date(result.rows[0].timemin)
      }
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      let maxArrayValues = {"totalTracks": dataTotal, "velocity": dataNewMaxVel,"velocity_avg":dataNEWAVGVel,"duration": dataNewMaxDur,"duration_avg":dataNEWAVGDur, "length":dataNewMaxLen,"length_avg":dataNEWAVGLen ,"timemax": dataNewMaxTime, "timemin": dataNewMinTime }
      console.log(maxArrayValues)
      client.end();
      if(maxArrayValues!= null){
        res.status(200).send(JSON.stringify(maxArrayValues));
      }
    }

  });
  query3.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(result != null){
      let thisTotal = +result.rows[0].total
      //dataNewAVGTime = (dataNewAVGTime*dataTotal + thisTotal*result.rows[0].duration_avg)/(dataTotal + thisTotal)
      if(result.rows[0].veloc_avg != null) dataNEWAVGVel = (dataNEWAVGVel*dataTotal + thisTotal*result.rows[0].veloc_avg)/(dataTotal + thisTotal)
      if(result.rows[0].length_avg != null) dataNEWAVGLen = (dataNEWAVGLen*dataTotal + thisTotal*result.rows[0].length_avg)/(dataTotal + thisTotal)

      console.log(result.rows[0].duration_avg)
      if(result.rows[0].duration_avg != null){
        if (result.rows[0].duration_avg.hours != null || result.rows[0].duration_avg.hours != undefined )
          dataNEWAVGDur.hours = Math.floor((dataNEWAVGDur.hours*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.hours)))/(dataTotal + thisTotal)) //i know it isnt like this but time is running out.
        if (result.rows[0].duration_avg.minutes != null || result.rows[0].duration_avg.minutes != undefined )
          dataNEWAVGDur.minutes = Math.floor((dataNEWAVGDur.minutes*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.minutes)))/(dataTotal + thisTotal))
        if (result.rows[0].duration_avg.seconds != null || result.rows[0].duration_avg.seconds != undefined )
          dataNEWAVGDur.seconds = Math.floor((dataNEWAVGDur.seconds*dataTotal + thisTotal*(Number(result.rows[0].duration_avg.seconds)))/(dataTotal + thisTotal))
      }console.log(dataNEWAVGDur)
      if(dataNEWAVGDur.seconds == 0 ) {dataNEWAVGDur.seconds = "00"} //ik its bad
      else if(dataNEWAVGDur.seconds >= 60 ) {dataNEWAVGDur.seconds = "00"; dataNEWAVGDur.minutes += 1} //ik its bad
      else if(dataNEWAVGDur.seconds < 10 ) {dataNEWAVGDur.seconds = "0"+dataNEWAVGDur.seconds}
      if(dataNEWAVGDur.minutes == 0 ) {dataNEWAVGDur.minutes = "00"} //ik its bad
      else if(dataNEWAVGDur.minutes >= 60 ) {dataNEWAVGDur.minutes = "00"; dataNEWAVGDur.hours += 1}
      else if(dataNEWAVGDur.minutes < 10 ) {dataNEWAVGDur.minutes = "0"+dataNEWAVGDur.minutes}
      if(dataNEWAVGDur.hours == 0 ) {dataNEWAVGDur.hours = "00"} //ik its bad
      else if(dataNEWAVGDur.hours >= 24) dataNEWAVGDur.hours = "23" //ik ik
      else if(dataNEWAVGDur.hours < 10 ) {dataNEWAVGDur.hours = "0"+dataNEWAVGDur.hours}
      
      dataTotal = dataTotal + thisTotal;
      

      if(dataNewMaxVel < result.rows[0].veloc_max && result.rows[0].veloc_max != null){
        dataNewMaxVel = result.rows[0].veloc_max
      }
      let intervalVar = result.rows[0].duration
      
      console.log(result.rows[0].duration)
      if(result.rows[0].duration!= null){
        if(!(result.rows[0].duration.days === 'undefined')){
          if(dataNewMaxDur.days <  intervalVar.days)  {dataNewMaxDur.days =  intervalVar.days
          dataNewMaxDur.hours =  intervalVar.hours
          dataNewMaxDur.minutes =  intervalVar.minutes
          dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.hours === 'undefined')){
          if(dataNewMaxDur.hours <  intervalVar.hours && dataNewMaxDur.days == 0)  {
            dataNewMaxDur.hours =  intervalVar.hours
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.minutes === 'undefined')){
          if(dataNewMaxDur.minutes <  intervalVar.minutes && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0)  {
            dataNewMaxDur.minutes =  intervalVar.minutes
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
        if(!(result.rows[0].duration.seconds === 'undefined')){
          if(dataNewMaxDur.seconds <  intervalVar.seconds  && dataNewMaxDur.days == 0 && dataNewMaxDur.hours == 0 && dataNewMaxDur.minutes == 0)  {
            dataNewMaxDur.seconds =  intervalVar.seconds}
        }
      }
      if(dataNewMaxLen < result.rows[0].length && result.rows[0].length != null){
        dataNewMaxLen = result.rows[0].length
      }
      console.log(dataNewMaxTime)
      console.log(result.rows[0].timemax)
      if(dataNewMaxTime < new Date(result.rows[0].timemax) && result.rows[0].timemax != null){
        dataNewMaxTime = new Date(result.rows[0].timemax)
      }
      if(dataNewMinTime > new Date(result.rows[0].timemin) && result.rows[0].timemin != null){
        dataNewMinTime = new Date(result.rows[0].timemin)
      }
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      let maxArrayValues = {"totalTracks": dataTotal, "velocity": dataNewMaxVel,"velocity_avg":dataNEWAVGVel,"duration": dataNewMaxDur,"duration_avg":dataNEWAVGDur, "length":dataNewMaxLen,"length_avg":dataNEWAVGLen ,"timemax": dataNewMaxTime, "timemin": dataNewMinTime }
      console.log(maxArrayValues)
      client.end();
      if(maxArrayValues!= null){
        res.status(200).send(JSON.stringify(maxArrayValues));
      }
    }

  });

});

router.get('/maxTimeVarValue', function(req, res) {
  let client = new Client(conString); // Setup our Postgres Client
  let numberOfConnects = 0;
  client.connect(); // connect to the client
  let dataNewMax = 0
  let query = client.query(new Query("SELECT max(data_time_end) FROM trajectory_lines")); // Run our Query
  let query1 = client.query(new Query("SELECT max(data_time_end) FROM trajectory_lines1")); // Run our Query
  let query2 = client.query(new Query("SELECT max(data_time_end) FROM trajectory_lines2")); // Run our Query
  let query3 = client.query(new Query("SELECT max(data_time_end) FROM trajectory_lines3")); // Run our Query

  query.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMax < result.rows[0].max && result.rows[0].max != null){
      dataNewMax = result.rows[0].max
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      console.log(dataNewMax)
      client.end();
      if(dataNewMax != null){
        res.status(200).send((dataNewMax).toString());
      }
    }
  
  });
  query1.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMax < result.rows[0].max && result.rows[0].max != null){
      dataNewMax = result.rows[0].max
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      console.log(dataNewMax)
      client.end();
      if(dataNewMax != null){
        res.status(200).send((dataNewMax).toString());
      }
    }

  });
  query2.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMax < result.rows[0].max && result.rows[0].max != null){
      dataNewMax = result.rows[0].max
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      console.log(dataNewMax)
      client.end();
      if(dataNewMax != null){
        res.status(200).send((dataNewMax).toString());
      }
    }

  });
  query3.on("end", function (result) {
    //let data = require('../public/data/geoJSON.json')
    numberOfConnects = numberOfConnects + 1
    if(dataNewMax < result.rows[0].max && result.rows[0].max != null){
      dataNewMax = result.rows[0].max
    }
    if(numberOfConnects == 4){
      console.log("Here  is the max")
      console.log(dataNewMax)
      client.end();
      if(dataNewMax != null){
        res.status(200).send((dataNewMax).toString());
      }
    }

  });

});



//UPLOAD FILES FUNCTIONS

let storage = multer.diskStorage({
  destination: function(req, file, cb) {
      cb(null, './public/data');
   },
  filename: function (req, file, cb) {
      cb(null , file.originalname);
  }
});
let upload = multer({storage: storage}).array('track', 1500);

router.post('/fileUpload', (req, res, next) => {
  const fsExtra = require('fs-extra')
  fsExtra.emptyDirSync('./public/data')
  fsExtra.mkdirSync('./public/data/mods');
  upload(req,res,function(err) {
    const subprocess = callPython(8,1);
    try {

      console.log("Files have been passed to the server, starting preprocess now");
      //const pyProg = spawn('python', ['./public/python/joinTracks-1.py']);

    } catch(err) {
          console.log(err);
    }
    // print output of script
    subprocess.stdout.on('data', (data) => {
      //console.log("Preprocess GPX");
    });
    subprocess.stderr.on('data', (data) => {
      console.log(`error:${data}`);
    });
    subprocess.stderr.on('close', (data) => {
      console.log("Parsing the new GPX");
      
      preProcessFiles1(req,res);
    });
  })


});

function preProcessFiles1(req,res){
  
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
      //console.log("Files have been parsed");
    });
    subprocess.stderr.on('data', (data) => {
      console.log(`error:${data}`);
    });
    subprocess.stderr.on('close', (data) => {
      console.log("Dividing the trajectories");
      preProcessFiles2(req,res);
    });
}

function preProcessFiles2(req,res){
  const subprocess2 = callPython(2,1);
  // print output of script
  subprocess2.stdout.on('data', (data) => {
    //console.log("Tracks have been divided");
  });
  subprocess2.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess2.stderr.on('close', () => {
    console.log("Deleting trajectories with the same time");
    preProcessFiles3(req,res);
  });
}
function preProcessFiles3(req,res){
  const subprocess3 = callPython(3,1);
  // print output of script
  subprocess3.stdout.on('data', (data) => {
    //console.log("Points with the same time deleted");
  });
  subprocess3.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess3.stderr.on('close', () => {
    console.log("Deleting stop points");
    preProcessFiles4(req,res);
  });
}
function preProcessFiles4(req,res){
  const subprocess4 = callPython(4,1);
  // print output of script
  subprocess4.stdout.on('data', (data) => {
    //console.log("Stop points deleted");
  });
  subprocess4.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess4.stderr.on('close', () => {
    console.log("Deleting trajectories with only 1 point");
    preProcessFiles5(req,res);
  });
}
function preProcessFiles5(req,res){
  
  const subprocess5 = callPython(5,1);
  // print output of script
  subprocess5.stdout.on('data', (data) => {
    //console.log("Trajectories with only 1 point deleted");
  });
  subprocess5.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess5.stderr.on('close', () => {
    console.log("Creating tracks");
    preProcessFiles6(req,res);
  });
}
function preProcessFiles6(req,res){
  const subprocess6 = callPython(6,1);
  // print output of script
  subprocess6.stdout.on('data', (data) => {
    //console.log("Creating tracks");
  });
  subprocess6.stderr.on('data', (data) => {
    console.log(`error:${data}`);
  });
  subprocess6.stderr.on('close', () => {
    console.log("Going to place the unique ID");
    preProcessFiles7(req,res);
  });
}
function preProcessFiles7(req,res){
  
  let clientPost = new Client(conString); // Setup our Postgres Client
  clientPost.connect(); // connect to the client
  let queryViewMaxTid = clientPost.query(new Query("SELECT max(tid) FROM track_divided_by_time_30s"), (err) => {
    if(err)
      console.log(err);
  });
  queryViewMaxTid.on("end", function (result) {
    console.log("BELLOW IS THE VALUE OF MAX");

    let maxNumber = result.rows[0].max;
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
      
      createDB(req,res);
    });
  });
}

function createDB(req,res){
  
  let client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client
  let createDB = "CREATE TABLE public.track_divided_by_time_upload(taxi_id integer,long double precision,lat double precision,data_time timestamp without time zone,vel double precision,traj_id integer,start_long double precision,start_lat double precision,end_long double precision,end_lat double precision,tid integer,geom geometry(Point,4326),startpointgeom geometry(Point,4326),endpointgeom geometry(Point,4326),linegeom geometry(LineString,4326)) WITH (OIDS = FALSE)TABLESPACE pg_default;ALTER TABLE public.track_divided_by_time_upload OWNER to postgres;GRANT ALL ON TABLE public.track_divided_by_time_upload TO postgres; CREATE INDEX IF NOT EXISTS linegeom_trackdivUpload ON public.track_divided_by_time_upload USING gist (linegeom) TABLESPACE pg_default; CREATE INDEX IF NOT EXISTS tid_indexUpload ON public.track_divided_by_time_upload USING btree(tid)TABLESPACE pg_default;";
  client.query(createDB, async function (err) {
    if (err) {
      console.log("Database already exists, going to clean it now");
      await client.query(new Query("DELETE FROM track_divided_by_time_upload")).on("end",function(){client.end()
        insertToDB(req,res);});
    }
    else{
      client.end();
      
      insertToDB(req,res);
    }
  });
}

function insertToDB(req,res) {
    
    let numberOfLinesBy2k;
    const countLinesInFile = require('count-lines-in-file')
    countLinesInFile('./public/data/mods/finalOfALL.txt' , (error,number) => {

      console.log("Number of lines bellow");
      let numberL = parseInt(number);
      console.log(number);
      numberOfLinesBy2k = Math.floor(numberL/4000);
      let remainder = numberL % 4000;
      if(remainder > 0){
        numberOfLinesBy2k++;
      }
      console.log("Number of lines by 4k in the file generated");
      console.log(numberOfLinesBy2k);
      let exec = require('child_process').exec;
      //let childCountNumberLines = spawn("(get-Content ./public/data/finalOfALL.txt | measure-object -Line).Lines");
      //childCountNumberLines.stdout.on("data",function(data){
      //exec("wc –l  ./public/data/finalOfALL.txt", function (err, stdout) {

      let lineReader = require('readline').createInterface({
        input: require('fs').createReadStream('./public/data/mods/finalOfALL.txt')
      });
      let contLine = 0;

      let stringOfRows = "";
      lineReader.on('line',function (line) {
        if(contLine ==0){
          stringOfRows = "("+line.replace(/\n/g,'')+")";
        }
        else{
          stringOfRows = stringOfRows + ",("+line.replace(/\n/g,'')+")";
        }
        contLine ++;
        if (contLine == 4000){
          insertLines(stringOfRows,numberOfLinesBy2k,req);
          contLine = 0;
          stringOfRows = "";
        }
      }).on('close', function(){
        insertLines(stringOfRows,numberOfLinesBy2k,res,req);
      })
    });

}
let ClientEndTimes = 0;
function insertLines(stringOfRows,numberOfLinesBy2k,res,req){
  let clientPost = new Client(conString); // Setup our Postgres Client
  clientPost.connect(); // connect to the client
  let queryPost = clientPost.query(new Query("INSERT INTO track_divided_by_time_upload(taxi_id,long,lat,data_time,vel,traj_id,start_long,start_lat,end_long,end_lat,tid) VALUES"+stringOfRows), (err, res) => {
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
      calculateGeoms(req,res);
    }
  });
}
let geomsCalcualted = 0;
function calculateGeoms(req,res){
  let queryCreateGeoms1 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms1.connect(); // connect to the client
  let queryCreateGeoms2 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms2.connect(); // connect to the client
  let queryCreateGeoms3 = new Client(conString); // Setup our Postgres Client
  queryCreateGeoms3.connect(); // connect to the client
  let geom1 = queryCreateGeoms1.query(new Query("UPDATE track_divided_by_time_upload SET geom = ST_SetSRID(ST_MakePoint(long,lat),4326);"));
  let geom2 = queryCreateGeoms2.query(new Query("UPDATE track_divided_by_time_upload SET startpointgeom = ST_SetSRID(ST_MakePoint(start_long,start_lat),4326);"));
  let geom3 = queryCreateGeoms3.query(new Query("UPDATE track_divided_by_time_upload SET endpointgeom = ST_SetSRID(ST_MakePoint(end_long,end_lat),4326);"));
  geom1.on("end", function(){
    queryCreateGeoms1.end();
    geomsCalcualted++;
    console.log("Main Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide(req,res);
    }
  });
  geom2.on("end", function(){
    queryCreateGeoms2.end();
    geomsCalcualted++;
    console.log("Start Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide(req,res);
    }
  });
  geom3.on("end", function(){
    queryCreateGeoms3.end();
    geomsCalcualted++;
    console.log("End Geom query completed")
    if(geomsCalcualted == 3){
      geomsCalcualted = 0;
      unifySubSegsANDDivide(req,res);
    }
  });
}
let resultForRefresh
function unifySubSegsANDDivide(req,res){
  let cont = 0
  let clientUnify = new Client(conString); // Setup our Postgres Client
  clientUnify.connect(); // connect to the client
  console.log("Gonna unify the point by pairs for attribute lenses");
  let query = clientUnify.query(new Query(" WITH tryingToDivide AS (SELECT tid as idThis, geom as geomThis, data_time as dataTime, lag(tid) over (order by tid asc,data_time asc) as idPrev, lag(geom) over (order by tid asc, data_time asc) as geomPrev FROM track_divided_by_time_upload) UPDATE track_divided_by_time_upload SET linegeom = CASE WHEN idThis = idPrev THEN ST_SetSRID(ST_MakeLine(geomPrev,geomThis),4326) ELSE NULL END FROM tryingToDivide WHERE tid = idThis AND  data_time = dataTime")); // Run our Query
  query.on("end", function (result) {
    cont += 1
    if(cont == 5){
      console.log(cont)
      if (!res.headersSent) {
        console.log("Headers not sent")
        if (typeof res.writeHead === 'function'){res.writeHead(200, {
        "Location": "http://localhost:3000/map"})
        }
      }
      else console.log("Headers already sent")
    }
    console.log("Completed pairs for attribute lenses");
    let queryUpload = clientUnify.query(new Query("INSERT INTO track_divided_by_time_30s (taxi_id,long,lat,data_time,vel,traj_id,start_long,start_lat,end_long,end_lat ,tid,geom,startpointgeom,endpointgeom,linegeom) SELECT * FROM track_divided_by_time_upload"));
    queryUpload.on("end", function (result) {
      console.log("Tracks ready for attribute lenses");

    });
  });
  let clientCreateLines1 = new Client(conString); // Setup our Postgres Client
  clientCreateLines1.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 1");
  let query0 = clientCreateLines1.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng <= 500)")); // Run our Query
  query0.on("end", function (result) {
    cont += 1
    if(cont == 5){
      console.log(cont)
      if (!res.headersSent) {
        console.log("Headers not sent")
        if (typeof res.writeHead === 'function'){res.writeHead(200, {
        "Location": "http://localhost:3000/map"})
        }
      }
      else console.log("Headers already sent")
    }
    clientCreateLines1.end();
    console.log("table 1 completed");
  });
  let clientCreateLines2 = new Client(conString); // Setup our Postgres Client
  clientCreateLines2.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 2");
  let query1 = clientCreateLines2.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines1 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 300 AND leng <= 1000)")); // Run our Query
  query1.on("end", function (result) {
    cont += 1
    if(cont == 5){
      console.log(cont)
      if (!res.headersSent) {
        console.log("Headers not sent")
        if (typeof res.writeHead === 'function'){res.writeHead(200, {
        "Location": "http://localhost:3000/map"})
        }
      }
      else console.log("Headers already sent")
    }
    
    clientCreateLines2.end();
    console.log("table 2 completed");

  });
  let clientCreateLines3 = new Client(conString); // Setup our Postgres Client
  clientCreateLines3.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 3");
  let query2 = clientCreateLines3.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines2 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 700 AND leng <= 2500)")); // Run our Query
  query2.on("end", function (result) {
    cont += 1
    if(cont == 5){
      console.log(cont)
      if (!res.headersSent) {
        console.log("Headers not sent")
        if (typeof res.writeHead === 'function'){res.writeHead(200, {
        "Location": "http://localhost:3000/map"})
        }
      }
      else console.log("Headers already sent")
    }
    clientCreateLines3.end();
    console.log("table 3 completed");
    
  });
  let clientCreateLines4 = new Client(conString); // Setup our Postgres Client
  clientCreateLines4.connect(); // connect to the client
  console.log("Gonna unify and upload them to table 4");
  let query3 = clientCreateLines4.query(new Query("WITH multis AS ( SELECT tid, min(data_time) AS time_start, max(data_time) as time_end, ST_MakeLine(array_agg(geom ORDER BY tid,data_time)) AS mylines, min(startpointgeom) AS sPGeom, min(endpointgeom) AS ePGeom, AVG(vel) AS veloc_avg, array_agg(vel) as velo FROM track_divided_by_time_upload GROUP BY tid) INSERT INTO trajectory_lines3 (SELECT tid,geom,time_start,time_end, sPGeom, ePGeom, veloc_avg,duration,leng,velo FROM  (SELECT tid, (ST_Dump(mylines)).geom,time_start, time_end, sPGeom, ePGeom, veloc_avg, (time_end - time_start) as duration,ST_Length(ST_Transform((ST_Dump(mylines)).geom,3857)) as leng , velo FROM multis) as l WHERE leng > 2500)")); // Run our Query
  query3.on("end", function (result) {
    cont += 1
    if(cont == 5){
      console.log(cont)
      if (!res.headersSent) {
        console.log("Headers not sent")
        if (typeof res.writeHead === 'function'){res.writeHead(200, {
        "Location": "http://localhost:3000/map"})
        }
      }
      else console.log("Headers already sent")
    }
    clientCreateLines4.end();
    console.log("table 4 completed");
    
  });
}

function callPython(number,tidNumber){
  console.log("Gonna call the script now")
  if(number == 1){
    if (isWindows) return spawn('python',["-u",'./public/python/joinTracks-1.py']);
    else return spawn('python3',["-u",'./public/python/joinTracks-1.py']);
  }
  else if (number == 2){
    if (isWindows) return spawn('python',["-u",'./public/python/separate_tracks-2.py']);
    else return spawn('python3',["-u",'./public/python/separate_tracks-2.py']);
  }
  else if (number == 3){
    if (isWindows) return spawn('python',["-u",'./public/python/delete_Same_time_Points-3.py']);
    else return spawn('python3',["-u",'./public/python/delete_Same_time_Points-3.py']);
  }
  else if (number == 4){
    if (isWindows) return spawn('python',["-u",'./public/python/delete_Stop_Points-4.py']);
    else return spawn('python3',["-u",'./public/python/delete_Stop_Points-4.py']);
  }
  else if (number == 5){
    if (isWindows) return spawn('python',["-u",'./public/python/delete1Point-5.py']);
    else return spawn('python3',["-u",'./public/python/delete1Point-5.py']);
  }
  else if (number == 6){
    if (isWindows) return spawn('python',["-u",'./public/python/Create_Tracks-6.py']);
    else return spawn('python3',["-u",'./public/python/Create_Tracks-6.py']);
  }
  else if (number == 7){
    if (isWindows) return spawn('python',["-u",'./public/python/txtJoinPosition-7.py', tidNumber]);
    else return spawn('python3',["-u",'./public/python/txtJoinPosition-7.py', tidNumber]);
  }
  else if (number == 8){
    if (isWindows) return spawn('python',["-u",'./public/Preprocessing/UnderstandMySteps.py']);
    else return spawn('python3',["-u",'./public/Preprocessing/UnderstandMySteps.py',"./public/data"]);
  }
  else{
    console.log("something is wrong, the number is wrong ")
  }
}
var url = require('url');

function getFormattedUrl(req) {
    return url.format({
        protocol: req.protocol,
        host: req.get('host')
    });
}
//Give acess to static folders
//setting middleware
console.log(__dirname)
var dirrectoryPublic = replaceGlobally(__dirname,"routes","")
console.log(dirrectoryPublic)
app.use(express.static('public'));

//Serves all the request which includes /images in the url from Images folder
app.use('/activeCSV', express.static(dirrectoryPublic + '/activeCSV'));

//merge csv files
function startMergingCSVs (csvFilePaths, outputFilePath) {
  const promises = csvFilePaths.map((path) => {
    return new Promise((resolve) => {
      const dataArray = [];
      return csv
          .fromPath(path, {headers: true})
          .on('data', function(data) {
            dataArray.push(data);
          })
          .on('end', function() {
            resolve(dataArray);
          });
    });
  });

  return Promise.all(promises)
      .then((results) => {

        const csvStream = csv.format({headers: true});
        const writableStream = fs.createWriteStream(outputFilePath);

        writableStream.on('finish', function() {
        });

        csvStream.pipe(writableStream);
        results.forEach((result) => {
          result.forEach((data) => {
            csvStream.write(data);
          });
        });
        csvStream.end();

      });

}
