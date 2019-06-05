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
	FROM track_divided_by_time_30s)

UPDATE track_divided_by_time_30s
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

  activeQuery = "";

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
      client.end();
  });

});

router.get('/query/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = req.params.radius/ 111120;

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
  var radiusDegrees = req.params.radius/ 111100;

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

router.get('/queryRemoval/:tab/:long/:lat/:radius/:type/:minValue/:maxValue', function(req, res) {
  console.log(req.params.long);
  console.log(req.params.lat);


  //Radius in meters to degrees
  var radiusDegrees = req.params.radius/ 111120;

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
  var radiusDegrees = req.params.radius/ 111120;
  var radiusDegreesNEW = req.params.radiusNEW/ 111120;

  var client = new Client(conString); // Setup our Postgres Client
  client.connect(); // connect to the client

  //DELETE OLD QUERY OF THE LENS
  var deleteOldPos = query_args_DecontructorQUERIES(req.params.tab,req.params.long, req.params.lat, radiusDegrees, req.params.type, req.params.minValue, req.params.maxValue);
  var newQuery = query_args_ContructorQUERIES(req.params.tab,req.params.longNEW, req.params.latNEW, radiusDegreesNEW, req.params.typeNEW, req.params.minValueNEW, req.params.maxValueNEW);
  
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