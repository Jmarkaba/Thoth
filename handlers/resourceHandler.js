// Imports
// Model functions
var Resource = require('../schemas/resource.js');
// Misc
const Discord = require('discord.js');
const utils = require('../utils/utils.js');

function handleResource(args, message, bot) {
    let command = args.shift();
    switch(command) {

        case 'add':
            if(!utils.isAuthorized(message)) break;
            // expecting _data to be length 4 and of the form
            // [group] [name] [description] [link]
            let _data = utils.parseDashes(args);
            if(_data.length === 4) {
                let resource = {
                    "group": _data[0].toLowerCase(),
                    "name": _data[1].toLowerCase(),
                    "description": _data[2],
                    "link": _data[3]
                };
                Resource.create(resource, err => {
                    if(err) message.channel.send("Resource successfully added.");
                    else message.channel.send("There was an error adding the resource.");
                });
            } else message.channel.send((_data.length < 4 ? "Too few" : "Too many") + " arguments provided for resource.");
            break;

        case 'remove':
            if(!utils.isAuthorized(message)) break;
            let del_id = args.join(" ").toLowerCase();
            Resource.deleteOne({name: del_id}, err => { 
                if(err) message.channel.send('Could not delete resource named "' + del_id + '"');
                else message.channel.send('Removed resource ' + del_id);
            });
            break;

        case 'fetch':
            let fet_id = args.join(" ").toLowerCase();
            Resource.findOne({name: fet_id}, function (err,doc) {
                if(!err && doc) message.channel.send(doc.fullResource);
                else message.channel.send('Could not find resource: "' + fet_id + '"');
            });
            break;

        case 'list':
            let groupid = args.join(" ").toLowerCase();
            let embed = fetchResourceGroupEmbed(groupid, bot);
            Resource.find({group: groupid}, function (err, docs) {
                if(!err && docs.length !== 0) {
                    docs.forEach(doc => embed.addField(utils.titleCase(doc.name), doc.fullResource));
                    message.channel.send({embed});
                } else message.channel.send("No such group found!")
            });
            break;

        default:
            message.channel.send('"' + command + '"' + ' is not recognized as a meeting command.');
            break;
    }
}
function fetchResourceGroupEmbed(group, bot) {
    var embed = new Discord.RichEmbed()
        .setTitle("Resource group: " + utils.titleCase(group))
        .setAuthor(bot.user.username, bot.user.avatarURL)
        .setTimestamp()
        .setColor(0xFF8C00);
    return embed;
}

// Exports
module.exports.handler = handleResource;