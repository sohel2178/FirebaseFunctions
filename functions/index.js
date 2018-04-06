const functions = require('firebase-functions');
const cors = require('cors')({origin:true});

const os = require('os');
const path = require('path');
const fs = require('fs');
const spawn = require('child-process-promise').spawn;
const Busboy = require('busboy');

const gcsconfig = {
    projectId: 'firenode-5276f',
    keyFileName:'firenode-5276f-firebase-adminsdk-dpge6-767e34b354.json'
};

const gcs = require('@google-cloud/storage')(gcsconfig);

// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
exports.onFileAdded = functions.storage.object().onFinalize(object => {
    //console.log(object);

    const fileBucket = object.bucket; // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.
    const contentType = object.contentType; // File content type.
    const resourceState = object.resourceState; // The resourceState is 'exists' or 'not_exists' (for file/folder deletions).
    const metageneration = object.metageneration;

    console.log(metageneration);

    const destinationBucket = gcs.bucket(fileBucket);

    const tempFilePath = path.join(os.tmpdir(), path.basename(filePath));
    const metaData = {contentType:contentType};

    // To Avoid Infinite Loop

    if(path.basename(filePath).startsWith('resized-')){
        console.log("We Already Renamed that File");
        return;
    }

    // Now the Main Action 

    // Dowload the File in Tmp Directory Then Upload it in a renamed Version

    return destinationBucket.file(filePath).download({
        destination:tempFilePath // Download the File in Temp Directory
    }).then(()=>{ //Promise When File Downloded
        // Resize the File into SameFilepath
        return spawn('convert',[tempFilePath,'-resize','500x500',tempFilePath])   
    }).then(()=>{
        // Upload into the Bucket(resized)
        return destinationBucket.upload(tempFilePath,{
            destination:'resized-'+path.basename(filePath),
            metadata:metaData
        })
    })
});


exports.onFileDelete = functions.storage.object().onDelete(object=>{
    console.log(object);

    return;
});

exports.uploadFile = functions.https.onRequest((req,res)=>{

    cors(req,res,()=>{
        if(req.method !=='POST'){
            return res.status(500).json({
                message: "Not Allowed"
            })
        }

        const busboy = new Busboy({headers:req.headers});

        let uploadData = null;

        busboy.on('file',(fieldname,fileStream,filename,encoding,mimetype)=>{
            const filePath = path.join(os.tmpdir(),filename);

            uploadData = {file:filePath,mimetype:mimetype};

            fileStream.pipe(fs.createWriteStream(filePath));
        });

        busboy.on('finish',()=>{

            const bucket = gcs.bucket('firenode-5276f.appspot.com');

            bucket.upload(uploadData.file,{
                uploadType:'media',
                metadata:{
                    metadata:{
                        contentType:uploadData.mimetype
                    }
                }
            }).then(storageFile=>{
                console.log(storageFile);

                return res.status(200).json({
                    message:"Image Uploaded Successfully"
                });

            }).catch((err)=>{
                res.status(500).json({
                    message:"Error Occur",
                    error:err
                     
                });
            });

        });

        busboy.end(req.rawBody);
    
        
    
    });

});

exports.onDataAdded = functions.database.ref('/messages/{id}').onCreate((snapshot,context)=>{
    const original = snapshot.val();

    const upperCase = original.toUpperCase();

    return snapshot.ref.parent.parent.child('uppercase').push(upperCase);
});