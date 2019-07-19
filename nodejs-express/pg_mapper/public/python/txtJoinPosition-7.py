import glob,os
import sys

print(sys.argv[1])
os.chdir("./public/data")
#os.chdir("../data")
with open("finalOfALL.txt", "w") as outfile:
        with open("Tracks-to-Trips-ft-BigGeo.txt", "r") as infile:
            line = infile.readline()
            trajID=int(sys.argv[1])
            taxi_idPrev = 1000000
            track_idPrev = 100000
            while line:
                taxi_idSTR, longi ,lati, date, vel,track_idSTR, lngs,lats,lnge,late  = line.split(",")
                taxi_id = int(taxi_idSTR)
                track_id = int(track_idSTR)
                if(taxi_id == taxi_idPrev and track_id == track_idPrev):
                    outfile.write(taxi_idSTR + "," +  longi + "," + lati + ",'" +  date + "'," +  vel + "," + track_idSTR + "," + lngs + "," + lats + "," + lnge + "," + late.strip() + "," + str(trajID)+"\n" )

                else:
                    print(taxi_idSTR + " " + track_idSTR + " and the other is: " + str(taxi_idPrev) + " " + str(track_idPrev))
                    taxi_idPrev = taxi_id
                    track_idPrev = track_id
                    trajID +=1

                    outfile.write(taxi_idSTR + "," +  longi + "," + lati + ",'" +  date + "'," +  vel + "," + track_idSTR + "," + lngs + "," + lats + "," + lnge + "," + late.strip() + "," + str(trajID)+"\n")


                line = infile.readline()
