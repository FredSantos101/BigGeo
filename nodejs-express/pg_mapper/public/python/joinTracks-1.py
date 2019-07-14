import glob, os
from xml.dom import minidom
import datetime


os.chdir("public/data")
#os.chdir("../data")
read_filesTXT = glob.glob("*.txt")
read_filesXML = glob.glob("*.xml")
read_filesGPX = glob.glob("*.gpx")
idTrack = 0
with open("final.txt", "w") as outfile:
    for f in read_filesTXT:
        with open(f, "r") as infile:
            print(infile.name)
            if(infile.name != 'finalOfALL.txt' and infile.name != 'final.txt' and infile.name != 'remove_Same_Time_Points.txt' and infile.name != 'remove_Stop_Points.txt' and infile.name != 'separateTracksByTime.txt' and infile.name != 'delete1Point.txt' and infile.name != 'Tracks-to-Trips-ft-BigGeo.txt'):
        
                thisDoc = minidom.parse(f)

                points1 = thisDoc.getElementsByTagName('trkpt')
                for point1 in points1:  
                    lon = point1.attributes['lon'].value
                    lat = point1.attributes['lat'].value
                    time = point1.getElementsByTagName('time')[0].firstChild.nodeValue.replace('T', ' ')
                    
                    outfile.write(str(idTrack) + "," + time.replace('Z', '') + "," + lon + "," + lat + "\n")
        idTrack = idTrack + 1 
                
    for g in read_filesXML:
        
        with open(g, 'r') as infile:
            thisDoc = minidom.parse(g)

            points2 = thisDoc.getElementsByTagName('trkpt')
            for point2 in points2:  
                lon = point2.attributes['lon'].value
                lat = point2.attributes['lat'].value
                time = point2.getElementsByTagName('time')[0].firstChild.nodeValue.replace('T', ' ')
                outfile.write(str(idTrack) + "," + time.replace('Z', '') + "," + lon + "," + lat + "\n")
        idTrack = idTrack + 1
    
    for h in read_filesGPX:
        
        with open(h, 'r') as infile:
            thisDoc = minidom.parse(h)

            points3 = thisDoc.getElementsByTagName('trkpt')
            for point3 in points3:  
                lon = point3.attributes['lon'].value
                lat = point3.attributes['lat'].value
                time = point3.getElementsByTagName('time')[0].firstChild.nodeValue.replace('T', ' ')
                outfile.write(str(idTrack) + "," + time.replace('Z', '') + "," + lon + "," + lat + "\n")
        idTrack = idTrack + 1

    print("All files parsed")