var queue = require('./lib/queue')
  , _ = require('lodash');


module.exports = function(robot) {
  console.log("DQ: being setup");

  robot.brain.on('loaded', function() {
    console.log("DQ: loaded");
    robot.brain.deploy = robot.brain.deploy || {};
    queue.init(robot.brain.deploy);
  });

  robot.respond(/dq help/i, help);
  robot.respond(/dq (add)(.*)?/i, queueUser);
  robot.respond(/dq (done|complete|donezo)/i, dequeueUser);
  robot.respond(/dq (current|who\'s (deploying|at bat))/i, whosDeploying);
  robot.respond(/dq (next|who\'s (next|on first|on deck))/i, whosNext);
  robot.respond(/dq (remove|kick) (.*)/i, removeUser);
  robot.respond(/dq (list)/i, listQueue);
  robot.respond(/dq (dump|debug)/i, queueDump);

  robot.respond(/dq ping/i, function(res) {
    res.send('deploy pong');
    res.reply('deploy reply pong');
  });

  /**
   * Help stuff
   * @param res
   */
  function help(res) {
    res.send(
      '`dq add _metadata_`: Add yourself to the deploy queue. Hubot give you a heads up when it\'s your turn. Anything after `add` will be included in messages about what you\'re deploying, if you\'re into that sort of thing. Something like `hubot deploy add my_api`.\n' +
      '`dq done`: Say this when you\'re done and then Hubot will tell the next person. Or you could say `dq complete` or `dq donezo`.\n' +
      '`dq remove _user_`: Removes a user completely from the queue. Use `remove me` to remove yourself. As my Uncle Ben said, with great power comes great responsibility. Expect angry messages if this isn\'t you remove someone else who isn\'t expecting it. Also works with `dq kick _user_`.\n' +
      '`dq current`: Tells you who\'s currently deploying. Also works with `dq who\'s deploying` and `dq who\'s at bat`.\n' +
      '`dq next`: Sneak peek at the next person in line. Do this if the anticipation is killing you. Also works with `dq who\'s next` and `dq who\'s on first`.\n' +
      '`dq list`: Lists the queue. Use wisely, it\'s going to ping everyone :)\n' +
      '`dq debug`: Kinda like `dq list`, but for nerds.\n' +
      '`dq help`: This thing.'
    );
  }

  /**
   * Add a user to the queue
   * @param res
   */
  function queueUser(res) {
    var user = res.message.user.name
      , length = queue.length()
      , metadata = (res.match[2] || '').trim();

    if (queue.contains({name: user})) {
      res.reply('Sorry but you can only have one position in the queue at a time. Please complete your first deploy before requeueing yourself.');
      return;
    }

    queue.push({name: user, metadata: metadata});

    if (length === 0) {
      res.reply('Go for it!');
      return;
    }

    if (length === 1) {
      res.reply('Alrighty, you\'re up next!');
      return;
    }

    res.reply('Cool, There\'s ' + (length - 1) + ' person(s) ahead of you. I\'ll let you know when you\'re up.');
  }

  /**
   * Removes a user from the queue if they exist and notifies the next user
   * @param res
   */
  function dequeueUser(res) {
    var user = res.message.user.name;

    if (!queue.contains({name: user})) {
      res.reply('Ummm, this is a little embarrassing, but you aren\'t in the queue :grimacing:');
      return;
    }

    if (!queue.isCurrent({name: user})) {
      res.reply('Nice try, but it\'s not your turn yet');
      return;
    }

    queue.advance();
    res.reply('Nice job! :tada:');

    if (!queue.isEmpty()) {
      // Send DM to next in line if the queue isn't empty
      notifyUser(queue.current());
    }
  }

  /**
   * Who's deploying now?
   * @param res
   */
  function whosDeploying(res) {
    var name = res.message.user.name
      , user = {name: name};

    if (queue.isEmpty()) {
      res.send('Nobodyz!');
    } else if (queue.isCurrent(user)) {
      res.reply('It\'s you. _You\'re_ deploying. Right now.');
    } else {
      var current = queue.current()
        , message = current.name + ' is deploying';

      message += current.metadata ? ' ' + current.metadata : '.';
      res.send(message);
    }
  }

  /**
   * Who's up next?
   * @param res
   */
  function whosNext(res) {
    var user = res.message.user.name
      , next = queue.next();

    if (!next) {
      res.send('Nobodyz!');
    } else if (queue.isNext({name: user})) {
      res.reply('You\'re up next! Get ready!');
    } else {
      res.send(queue.next().name + ' is on deck.');
    }
  }

  /**
   * Removes all references to a user from the queue
   * @param res
   */
  function removeUser(res) {
    var name = res.match[2]
      , user = {name: name}
      , isCurrent = queue.isCurrent(user)
      , notifyNextUser = isCurrent && queue.length() > 1;

    if (name === 'me') {
      removeMe(res);
      return;
    }

    if (!queue.contains(user)) {
      res.send(name + ' isn\'t in the queue :)');
      return;
    }

    queue.remove(user);
    res.send(name + ' has been removed from the queue. I hope that\'s what you meant to do...');

    if (notifyNextUser) {
      notifyUser(queue.current());
    }
  }

  /**
   * Removes the current user from the queue IF the user is not at the head.
   * @param res
   */
  function removeMe(res) {
    var name = res.message.user.name
      , user = {name: name};

    if (!queue.contains(user)) {
      res.reply('No sweat! You weren\'t even in the queue :)');
    } else if (queue.isCurrent(user)) {
      res.reply('You\'re deploying right now! Did you mean `deploy done`?');
      return;
    }

    queue.remove(user);
    res.reply('Alright, I took you out of the queue. Come back soon!');
  }

  /**
   * Prints a list of users in the queue
   * @param res
   */
  function listQueue(res) {
    if (queue.isEmpty()) {
      res.send('Nobodyz! Like this: []');
    } else {
      res.send('Here\'s who\'s in the queue: ' + _.pluck(queue.get(), 'name').join(', ') + '.');
    }
  }

  /**
   * Dumps the queue to the channel for debugging
   * @param res
   */
  function queueDump(res) {
    res.send(JSON.stringify(queue.get(), null, 2));
  }

  /**
   * Notify a user via DM that it's their turn
   * @param user
   */
  function notifyUser(user) {
    robot.messageRoom(user.name, 'Hey, your turn to deploy!');
  }
};
