# BigGeo

BigGeo is a georeferenced data visualisation tool for analysing and interacting with thousands of trajectories.

Here you can create lenses to filter the trajectories you pretend and after you can analyse their attributes through visual encodings on each trajectory. Our goal was to study and develop an effecive way of visualizing and interacting with big trajectory dataset.
Developped by master's student Frederico Santos and supervised by prof. Daniel Gonçalves From Instituto Superior Tecnico, Portugal. 

To start you must install Node.js and the Express framework, and PostgreSQL with the PostGIS extention. 
On /BigGeo/nodejs-express/pg_mapper/routes/index.js you must change the login conditions for your PostgreSQL connection 
On line 31 we have the following:<br />
    let databaseCreation = "template_postgis";   //represents the name of the PostGIS template created<br />
    let username = "postgres"                    // admin username "postgres" by default <br />
    let password = "postgres"                    // admin password "postgres" by default <br />
    let host = "localhost:5432"<br />
    let database = "taxi_beij"                   // database name which is created using the template defined before<br />

Then you must install Python 3.7, and the libraries present in https://github.com/FredSantos101/BigGeo-data-scripts<br />

To upload your own trajectories, do so through the visualizations menu.
