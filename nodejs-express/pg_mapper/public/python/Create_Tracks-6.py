import glob,os
from tracktotrip import Track, Segment, Point
from datetime import datetime, timedelta

os.chdir("./public/data/mods")
#os.chdir("../data")
read_files = glob.glob("delete1Point.txt")

time_of_start = datetime.now()

print( time_of_start.isoformat(' ', 'seconds'))

newArray = False
firstTime = False
with open("Tracks-to-Trips-ft-BigGeo.txt", "w") as outfile:
    for f in read_files:
        with open(f, "r") as infile:
            print(infile.name)
            trajs = Segment([])
            line = infile.readline()
            if(line == "\n"):
                    break


            taxi_id2 = 100000
            trajNum2 = 100000

            #print(pos)
            cont_pointsInside=0
            cont=0
            while (line):
                if(line == "\n"):
                    break

                taxi_idStr, date, longi, lati, trajNum = line.split(",")
                longi = float(longi)
                lati = float(lati)
                taxi_id = int(taxi_idStr)
                fmt = '%Y-%m-%d %H:%M:%S'
                tstamp = datetime.strptime(date,fmt)

                if(taxi_id2 != taxi_id or trajNum2 != trajNum):
                    #FIRST LINE CANT CREATE A TRIP
                    if(firstTime):
                        if len(trajs.points) > 0 :
                            newArray = True
                    #ASSIGN FIRST SEGMENT (FROM THE FIRST LINE) TO THE TRACK ARRAY
                    else:
                        trajs = Segment([Point(lati, longi, tstamp)])
                        taxi_id2 = taxi_id
                        trajNum2 = trajNum
                        date2 = date
                        firstTime = True

                else:
                    trajs.add_point_end_of_segment(Point( lati, longi, tstamp))
                    taxi_id2 = taxi_id
                    trajNum2 = trajNum

                if(newArray):
                    newArray = False
                    cont += 1

                    trip = Track(name=cont, segments=[trajs])
                    trajs = Segment([])
                    trajs = Segment([Point(lati, longi, tstamp)])
                    trip.to_trip(False, 'extrapolate', 50, False, 5, 5, False, 20.0, 40)
                    #now we need to print the results
                    #print(len(trip.segments))
                    #for ind in range(len(trip.segments)-1):
                        #print("SEGMENTOS")
                    print("The size of the points is:")
                    print(len(trip.segments[0].points))
                    for indPoint in range(len(trip.segments[0].points)):

                        outfile.write(str(taxi_id2) + "," +  '{0:.5f}'.format(float(trip.segments[0].points[indPoint].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[indPoint].lat)) + "," + trip.segments[0].points[indPoint].time.isoformat(' ', 'seconds')+ "," + str(trip.segments[0].points[indPoint].vel) + "," + trajNum2.strip() + "," + '{0:.5f}'.format(float(trip.segments[0].points[0].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[0].lat)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[-1].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[-1].lat)) + "\n"   )

                    #TODO Create to_txt method in the library
                    taxi_id2 = taxi_id
                    trajNum2 = trajNum
                    date2 = date


                line = infile.readline()
            cont += 1
            trip = Track(name="last", segments=[trajs])
            trip.to_trip(False,'extrapolate', 20, False, 5, 5, False, 20.0, 40)
            print("LAST SEGMENT OF TRAJECTORY")
            for indPoint in range(len(trip.segments[0].points)):

                        outfile.write(str(taxi_id2) + "," +  '{0:.5f}'.format(float(trip.segments[0].points[indPoint].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[indPoint].lat)) + "," + trip.segments[0].points[indPoint].time.isoformat(' ', 'seconds')+ "," + str(trip.segments[0].points[indPoint].vel) + "," + trajNum2.strip() + "," + '{0:.5f}'.format(float(trip.segments[0].points[0].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[0].lat)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[-1].lon)) + "," + '{0:.5f}'.format(float(trip.segments[0].points[-1].lat)) + "\n"   )


time_of_end = datetime.now()
print("Time of start was: " + time_of_start.isoformat(' ', 'seconds') + " and time of end was: " + time_of_end.isoformat(' ', 'seconds'))
