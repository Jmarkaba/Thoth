/**
 * @version: 1.0
 * @author: Jah Markabawi
 */
// Constants and globals
const INFO_PATH = './info.json';

var info; // reading and writing in real time
var generalChannel; // references 'general' channel on init
var notHereRole; // hireferences 'Not Here' role on init
var server;

// Requirements for Discord bot
const Discord = require('discord.js');
const auth = require('./auth.json');

// Datetime configuration and scheduling
const $D = require('./date.js');
const schedule = require('node-schedule')

// For storing the meeting and resource objects
const fs = require('fs');


// Initialize Discord bot
const bot = new Discord.Client();
bot.on('ready', function (evt) {
    bot.setMaxListeners(25);
    // @TODO: Remove hard coding of channel and role names
    generalChannel = bot.channels.find(el => el.name === 'testing');
    server = bot.guilds.first();
    notHereRole = server.roles.find(r => r.name === 'Not Here');
    // Load the resource and meeting info
    // @TODO: improve method of fetching resource
    // and meeting (i.e., switch to database)
    info = JSON.parse(fs.readFileSync(INFO_PATH));
    console.log("Connected!");
});
bot.on('message', message => {
    if (message.content.substring(0, 2) === "//") {
        // preprocess args
        let args = message.content.substring(2).split(' ');
        args = args.filter((el) => {
            return el !== '';
        });

        // reverse the order of the array in place
        args.reverse(); 

        // args will now be a stack of the commands and data ouputted
        // from the message so we can pop each command one at a time
        // and then just pass the array (args)
        let command = args.pop() // removes last element (first in the message)
        
        switch (command) {
            case 'test':
                message.channel.sendCode("1213kjfl");
                break;
            case 'meeting':
                handleMeeting(args, message);
                break;
            case 'resource':
                handleResource(args, message);
            default:
                message.channel.send('"' + command + '"' + ' is not a valid command.');
                break;
        }
    }
    saveInfo(); //to make sure the info is stored correctly
});
// initialize client bot
bot.login(auth.token);



/*
 * Meeting related functions

 * Try to mainain the integrity of a meeting object:
    e.g., 
    meeting {
        'start': ...
        'end': ... 
        'location': ...
        'duration': ...
        'password': ... 
    }
    // all properties of a meeting must be kept 
    // as typeof 'string'
*/
function handleMeeting(args, message) {
    let command = args.pop();
    switch (command) {

        // Adding a new meeting
        // Limited by the role
        case 'add':
            message.delete().catch(e => {});
            // checks permissions, breaks if false
            checkAuthorization(message.author);

            // expecting _data to be length 4 and of the form
            // [startTime] [location] [duration: hours] [password]
            let _data = parseDashes(args);
            if(_data.length === 4) {
                // start is a js Date object
                let start = $D.parse(_data[0])
                // check that it was parsed correctly
                if(start) {
                    let meeting = {
                        'start': JSON.stringify(start),
                        'end': JSON.stringify(start.add({hours: _data[2]})),
                        'location': _data[1],
                        'duration': _data[2],
                        'password': _data[3]
                    };
                    info.meetings['meeting_list'].push(meeting);
                    // re-adjust the start value (changed by the add function for meeting.end)
                    start.add({hours: '-'+_data[2]});

                    // schedule function for the date of the meeting
                    // see the startMeetingJob() function below for details
                    // meeting.start is the name of the job so that it can be cancelled
                    // if necessary
                    schedule.scheduleJob(meeting.start, start, startMeetingJob());
                    // notify the user
                    message.channel.send("A meeting has been added on " + meeting.start);
                } else message.channel.send('"'+_data[0]+'" could not be recognized as a valid date and time.'); 
            } else {
                outp = _data.length < 4 ? 'Not enough provided ' : 'Too many ';
                outp += 'arguments for command "' + command + '".'
                message.channel.send(outp);
            }
            break;

        // Signing into a meeting
        case 'signin':
            if(!info.meetings.current) message.channel.send("There is no meeting to sign into.");
            // checks that the password is valid
            if(args.pop() === info.meetings.current) {
                message.delete().catch(e => {});
                let userid = message.author.id;
                removeAbsence(message, userid);
                message.channel.send(message.author.nickname + " has been signed in.");
            } else message.channel.send("Incorrect password or no password provided.");
            break;
        
        //Calls the toString of the next meeting
        case 'next':
            let next = info.meetings.meeting_list.pop();
            message.channel.send(nextMeetingString(next));
            break;
        
        // Same as signin but to excuse someone via mentioning
        // Limited by role
        case 'excuse':
            // checks permissions, breaks if false
            checkAuthorization(message.author);

            let excused = args.pop()
            let excusedId = excused.substring(3, excused.length);
            let name = removeAbsence(message, excusedId);
            if(name) message.channel.send(name + " was excused from the current meeting.");
            else message.channel.send("Could not excuse " + excused + " from the meeting.");
            break;

        // Remove the next scheduled meeting
        // Limited by role
        case 'cancel':
            // checks permissions, breaks if false
            checkAuthorization(message.author);

            info.meetings['meeting_list'].pop();
            message.channel.send("The next meeting has been deleted. Type 'meeting list' to see all upcoming meetings.");
            break;

        // Lists all of the pending meetings
        case 'list':
            let list = "";
            info.meetings.meeting_list.forEach((m) => {
                list += briefMeetingString(m) +"\n";
            });
            message.channel.send(list);
            break;

        // Invalid commands
        default:
            message.channel.send('"' + command + '"' + ' is not recognized as a meeting command.');
            break;
    }
}
// The following methods are for the beginning 
// of a meeting:
function startMeetingJob() {
    resetAbsences(server);
    // removes the top meeting of the sorted meeting list
    let m = info.meetings.meeting_list.pop();
    // sets the current password
    info.meetings.current = m.password;
    
    // send a message every 3 minutes (180000 millis)
    setInterval(() => {
        generalChannel.send(notHereRole.toString() + " there is a meeting right now. Get here as soon as possible and sign in or leave a message explaining why you should be excused.");
    }, 180000);

    // new Date() gets current datetime then we add 20 min to it
    let future = new Date();
    future.setMinutes(future.getMinutes() + 20);
    // Job to stop pinging after 20 minutes by clearing setInterval
    schedule.scheduleJob(future, () => clearInterval());
    // Job to clean up at the end of a meeting
    schedule.scheduleJob($D.parse(m.end), () => {
        // remove the 'Not Here' role from each member
        server.members.forEach((mem) => mem.removeRole(notHereRole).catch(console.error));
        info.meetings['absent_members'] = [];
        info.meetings.current = null;
        // this is a different job that changes the info
        // at a different time, so we must save again
        saveInfo();
    });
    saveInfo() // save info at the end of the job
}
function resetAbsences(guild) {
    let arr = [];
    guild.members.forEach((mem) => {
        mem.addRole(notHereRole).catch(console.error);
        arr.push(mem.id);
    });
    info.meetings['absent_members'] = arr;
}
function removeAbsence(message, id) {
    info.meetings['absent_members'] = info.meetings.absent_members.filter((value) => {
        return value !== id;
    });
    let user = message.guild.members.find(id);
    if(user) {
        user.removeRole(notHereRole).catch(console.error);
        return user.nickname;
    } else return null;
}
// These are the toString methods for our 
// custom meeting objects
function nextMeetingString(meeting) {
    let time = $D.parse(meeting.start);
    return ["There will be a meeting on",time.toString('dddd'),time.toString('MMM'),
    time.toString('dd')+time.toString('S'),"at",time.toString('t')+".", "The meeting will take place at",
    meeting.location, ".", "It will be",meeting.duration,
    "hours long. Try not to be late!"].join(" ");
}
function briefMeetingString(meeting) {
    let time = $D.parse(meeting.start);
    return ["Time:", time.toString('d')+",", "Place:", meeting.location].join(" ");
}


/*
 * Meeting related functions

 * Again try to mainain the integrity of a resource objects:
    e.g., 
    resource {
        'id': ...
        'description': ...
        'link': ...
    }
    // all properties of a resource must be kept 
    // as typeof 'string'
*/
function handleResource(args, message) {
    let command = args.pop();
    switch(command) {
        case 'add':

            // expecting _data to be length 4 and of the form
            // [id] [description] [link]
            let _data = parseDashes(args);
            if(_data.length === 3) {

            } else {
                let output = _data.length < 3 ? "Too few" : "Too many";
                output += " arguments provided for resource."
                message.channel.send(output);
            }
            break;
        case 'remove':
            let del_id = args.pop()
            info['resources'] = info.resources.filter(r => {
                return r.id !== del_id;
            });
            message.channel.send('Removed resource named "' + del_id + '" if one existed');
            break;
        case 'fetch':
            let fet_id = args.pop();
            let resource = info.resources.find(r => r.id === fet_id);
            if(resource) {
                message.channel.send(resourceToString(resource));
            } else message.channel.send('Could not find resource: "' + fet_id + '"')
            break;
        default:
            break;
    }
}

/*
 * Universal functions
*/
function parseDashes(args) {
    // recreate the string to parse with dashes instead
    args.reverse();
    let s = args.join(" ");
    let _data = s.split('-').map((str) => str.trim());
    _data.shift();
    return _data;
}
function saveInfo() {
    let newData = JSON.stringify(info, null, 2);
    fs.writeFile(INFO_PATH, newData, err => { if(err) console.log(err); });
}
// For permission checks
function isAuthorized(member) {
    const AUTHORIZED = ['Director', 'Project Heads'];
    member.roles.forEach(role => {
        if(AUTHORIZED.includes(role.name)) return true;
    });
    return false;
}
// Use ONLY when in a switch-case that should break
function checkAuthorization(member) {
    if(!isAuthorized(message.author)) {
        message.channel.send("You do not have permission to use that command.")
        break;
    }
}