import glob
import pandas as pd

'''
read_files = glob.glob("*.txt")

with open("final.txt", "wb") as outfile:
    for f in read_files:
        with open(f, "rb") as infile:
            outfile.write(infile.read()) '''


PATH_INPUT='dataset.csv'
PATH_OUTPUT='dataset_output.csv'

if __name__ == "__main__":
    df = pd.read_csv(PATH_INPUT)
    print("yo")
    df.groupby('taxi_id').agg(lambda col: ''.join(col))\
    print("ola")
    df_final.to_csv(PATH_OUTPUT, encoding='utf-8')
    print("skr")

