const http = require('http')
const port = 80
const _ = require('lodash')
const express = require('express')
const app = express()  
const bodyParser = require('body-parser');
const Botkit = require('botkit');
const firebase = require('firebase-admin');
const serviceAccount = require('./potluckslack-firebase-adminsdk-u8fqm-4e00884c36.json');

firebase.initializeApp({
  credential: firebase.credential.cert(serviceAccount),
  databaseURL: 'https://potluckslack.firebaseio.com'
});

const db = firebase.database();

app.use(bodyParser.json())

app.get('/', (request, response) => {  
  response.send('Hello from Express!')
})

app.post('/slackbot', (request, response) => {
//  console.log('got slackbot request', request.body);
  response.status(200).json({challenge: request.body.challenge})
})

app.listen(port, (err) => {  
  if (err) {
    return console.log('something bad happened', err)
  }
  console.log(`server is listening on ${port}`)
})

var controller = Botkit.slackbot({
 debug: true
})
/*.configureSlackApp({
  scopes: ['channels:write']
})*/

let generalChannelId
let members
controller.spawn({
  token: 'xoxb-225309287713-uO8xUJu3JEkLXFf0cf2LDu9G',
}).startRTM((err, bot) => {
  bot.api.channels.list({},function(err,response) {
    const channels = response.channels
    const generalChannel = channels.filter(c => c.is_general)[0]
    generalChannelId = generalChannel.id
    // console.log('general channel id = ', generalChannelId)
  })

  bot.api.users.list({}, (err, response) => {
    // console.log('users.list', response)
    members = response.members
  })
});

function handleKarma(bot, message) {
  // console.log('message', message)
  const userRegexp = /\<\@[a-zA-Z0-9_]*\>/g
  const karmaRegexp = /\<\@[a-zA-Z0-9_]*\>\s*\+\+/g
  const userComment = _.get(message,'text') || _.get(message, 'comment.comment')
  const karmaCheck = userComment.search(karmaRegexp)
  if (karmaCheck === -1) return;

  const matchedUsers = userComment.match(karmaRegexp)
  matchedUsers.forEach(user => {
    //  console.log('matchedUsers ', matchedUsers, user);
    if (!user) return;
    const matchedUser = user.match(userRegexp)
    const upvotesRef = db.ref(`server/karma/${matchedUser}`);
    let karma;

    upvotesRef.transaction(current_value => {
      karma = (current_value || 0) + 1
      return karma
    }, () => {
      message.channel = message.channel ? message.channel : generalChannelId
      bot.reply(message, `Ahhh snap, ${matchedUser} just gained a level!! (karma: ${karma})`)
    })
  })
}

function snapshotToArray(snapshot) {
  let returnArr = [];

  snapshot.forEach(childSnapshot => {
    returnArr.push({ name: userIdToUserName(childSnapshot.key.slice(2,11)),  karma: childSnapshot.val() });
  });

  return returnArr;
}

function userIdToUserName(id) {
  return members.filter((m) => m.id === id)[0].name
}

function handleLeaderboard(bot, message) {
  db.ref('server/karma').once('value').then((snapshot) => {
    console.log('karma', snapshotToArray(snapshot))
    const rawKarma = snapshotToArray(snapshot)
    const sortedLeaderboard = rawKarma.sort((a,b) => {
      if (a.karma>b.karma) return -1
      if (b.karma>a.karma) return 1
      return 0
    })
    const out = sortedLeaderboard.reduce((list, member) => `${list}${member.name}: ${member.karma}\n`, 'Potluck Karma Leaderboard: \n')
    bot.reply(message, out)
  })
}

function handleChannelCreated(bot, message) {
  console.log('handleChannelCreated', message)
  bot.api.channels.invite({
    channel: message.channel.id,
    user: 'U6M938FLZ'
  },(err, response) => {
    console.log('channels.invite reponse', err, response)
  }) 
}

controller.hears('@', ['ambient'], handleKarma)
controller.on('file_comment_added', handleKarma)
controller.hears('leaderboard', ['direct_mention'], handleLeaderboard)
//controller.on('channel_created', handleChannelCreated)