const tmi = require('tmi.js');
const express = require('express');
const logger = require('morgan');
const consola = require('consola');
const lusca = require('lusca');
const helmet = require('helmet');
const compression = require('compression');
const mongoose = require('mongoose');

const { Timer } = require('easytimer.js');

const { addMessage } = require('./utils/messageQueue');

const User = require('./models/User');

/**
 * Load environment variables from the .env file, where API keys and passwords are stored.
 */
require('dotenv').config();

/**
 * Created Express server.
 */
const app = express();

/**
 * Connect to MongoDB.
 */
mongoose.set('useFindAndModify', false);
mongoose.set('useCreateIndex', true);
mongoose.set('useNewUrlParser', true);
mongoose.set('useUnifiedTopology', true);
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true
});
const db = mongoose.connection;

/**
 * Express configuration (compression, logging, body-parser,methodoverride)
 */
app.set('view engine', 'ejs');
app.set('host', process.env.IP || '127.0.0.1');
app.set('port', process.env.PORT || 8080);
app.use(lusca.xframe('SAMEORIGIN'));
app.use(lusca.xssProtection(true));
lusca.referrerPolicy('same-origin');
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.set('etag', false);
app.use(helmet());
app.use(compression());
app.disable('x-powered-by');

switch (process.env.NODE_ENV) {
  case 'production':
    app.use(logger('combined'));
    // app.use(cors(corsOptions));
    app.enable('trust proxy');
    app.set('trust proxy', 1);
    break;
  default:
    app.use(logger('dev'));
}

app.use(express.static('public'));

app.get('/leaderboard', async (req, res) => {
  const users = await User.find().sort({ wins: -1 });
  res.render('leaderboard.ejs', { users });
});

/**
 * Handle 404 errors
 */
app.use((req, res, next) => {
  res.status(404);

  if (req.path === '/api' || RegExp('/api/.*').test(req.path)) {
    return res
      .status(404)
      .json({ error: 'Whoops, this resource or route could not be found' });
  }
  res.type('txt').send('Not found');
});

// eslint-disable-next-line new-cap
const twitch = new tmi.client({
  options: {
    debug: true
  },
  connection: {
    reconnect: true,
    secure: 443
  },
  identity: {
    username: process.env.TWITCH_BOT_USERNAME,
    password: `oauth:${process.env.TWITCH_BOT_TOKEN}`
  },
  channels: [process.env.TWITCH_CHANNEL]
});

/**
 * Twitch Bot Login
 */
try {
  twitch.connect();
  console.log('CONNECTED TO TWITCH CHAT');
} catch (error) {
  console.error(new Error(error));
}

let votes = [];
let winners = [];

function addVote(username, color) {
  votes.push({
    username,
    color
  });
}
function addWinners(username) {
  winners.push(username);
}

const voteTimer = new Timer();

// Starts listening to chat.
twitch.on('chat', async (channel, userstate, message, self) => {
  const prefix = '!';
  //  Stops the bot from listening to its self.
  if (self) return;

  if (!message.startsWith(prefix)) {
    return;
  }

  const twitchChannel = channel.slice(1);
  const args = message.substring(prefix.length).split(' ');

  const { username } = userstate;

  const badges = userstate.badges || {};
  const isBroadcaster = badges.broadcaster;
  const isMod = badges.moderator;
  const isModUp = isBroadcaster || isMod;

  const command = args[0];
  const arg1 = args[1];

  voteTimer.addEventListener('stopped', () => {
    addMessage(twitch, true, twitchChannel, 'Voting ended');
  });

  function startVote() {
    if (voteTimer.isPaused()) {
      return voteTimer.reset();
    }
    voteTimer.start({
      countdown: true,
      startValues: { minutes: 1, seconds: 31 }
    });
  }

  function permissionCheck() {
    if (!isModUp) {
      addMessage(
        twitch,
        true,
        twitchChannel,
        `@${username} > You don't have permission to run this command.`
      );
      return false;
    }
    return true;
  }

  switch (command) {
    case 'wins':
      // eslint-disable-next-line no-case-declarations
      const user = await User.findOne({ username });
      addMessage(
        twitch,
        true,
        twitchChannel,
        `@${username} > you have ${user.wins} wins currently.`
      );
      break;
    case 'purge':
      if (!isBroadcaster) {
        return addMessage(
          twitch,
          true,
          twitchChannel,
          `@${username} > You don't have permission to run this command.`
        );
      }
      await User.deleteMany({});
      break;
    case 'start':
      if (!permissionCheck()) return;
      startVote(twitchChannel);
      addMessage(
        twitch,
        true,
        twitchChannel,
        'Voting has begun!  Type !color [color] to make your guess.'
      );
      break;
    case 'color':
      if (voteTimer.isRunning()) {
        if (votes.find(o => o.username === username)) {
          return addMessage(
            twitch,
            true,
            twitchChannel,
            `@${username} > You have already voted.`
          );
        }
        addVote(username, arg1);
        addMessage(
          twitch,
          true,
          twitchChannel,
          `@${username} > You voted for ${arg1}`
        );
      } else {
        addMessage(
          twitch,
          true,
          twitchChannel,
          `@${username} > Sorry but voting has not started yet.`
        );
      }
      break;
    case 'win':
      winners = [];

      if (!permissionCheck(isModUp)) return;

      voteTimer.pause();
      votes.map(async x => {
        if (x.color !== arg1) {
          return;
        }

        addWinners(`@${x.username}`);

        const alreadyUser = await User.findOne({ username: x.username });
        if (!alreadyUser) {
          const newUser = new User({
            username: x.username,
            wins: 1
          });
          await newUser.save();
          addWinners(`@${x.username}`);
        } else {
          await User.findOneAndUpdate(
            { username: x.username },
            { $inc: { wins: 1 } }
          );
          console.log('adding user 2');
        }
      });

      if (winners.length === 0) {
        return addMessage(
          twitch,
          true,
          twitchChannel,
          'No winners this round.'
        );
      }

      addMessage(
        twitch,
        true,
        twitchChannel,
        `Winners are : ${winners.toString()}`
      );

      votes = [];

      break;
    default:
      break;
  }
});

/**
 * Express actions
 */
db.on('error', () => {
  consola.error(
    new Error('MongoDB connection error. Please make sure MongoDB is running.`')
  );
});

db.once('open', () => {
  app.listen(app.get('port'), () => {
    consola.log('----------------------------------------');
    consola.info(`Environment: ${app.get('env')}`);
    consola.info(`App URL: http://${app.get('host')}:${app.get('port')}`);
    consola.log('----------------------------------------');
  });
});

/**
 * Cloes connection to mongodb on exit.
 */
process.on('SIGINT', () => {
  mongoose.connection.close(() => {
    consola.success(
      'Mongoose connection is disconnected due to application termination'
    );
    process.exit(0);
  });
});
