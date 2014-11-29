// numtel:mysql
// MIT License, ben@latenightsketches.com
// test/MysqlSubscription.js

// TODO simulate many connections

var SUITE_PREFIX = 'numtel:mysql - MysqlSubscription - ';
var POLL_WAIT = 1000 + 200; // test/mysql.js :: POLL_INTERVAL + allowance

players = new MysqlSubscription('allPlayers');
myScore = new MysqlSubscription('playerScore', 'Maxwell');

var expectedRows = [ // test/mysql.js :: insertSampleData()
  { name: 'Planck', score: 70 },
  { name: 'Maxwell', score: 60 },
  { name: 'Leibniz', score: 50 },
  { name: 'Kepler', score: 40 }
];

var filterPollQueries = function(queries){
 return _.filter(queries, function(query){
   return !query.match(/select `key`, `last_update` from `/i);
  });
};

Tinytest.addAsync(SUITE_PREFIX + 'Initialization', function(test, done){
  Meteor.setTimeout(function(){
    test.isTrue(players.ready());
    test.equal(expectResult(players, expectedRows), true);
    done();
  }, POLL_WAIT);
});

Tinytest.addAsync(SUITE_PREFIX + 'Insert / Delete Row Sync',
function(test, done){
  var newPlayer = 'Archimedes';
  var eventRecords = [];
  players.addEventListener('update.test1', function(index, msg){
    test.equal(typeof index, 'number');
    test.equal(typeof msg, 'object');
    test.equal(arguments.length, 2);
    eventRecords.push('update');
  });
  players.addEventListener('added.test1', function(index, newRow){
    test.equal(typeof index, 'number');
    test.equal(typeof newRow, 'object');
    test.equal(arguments.length, 2);
    eventRecords.push('added');
  });
  players.addEventListener('changed.test1', function(index, oldRow, newRow){
    test.equal(typeof index, 'number');
    test.equal(typeof oldRow, 'object');
    test.equal(typeof newRow, 'object');
    test.equal(arguments.length, 3);
    eventRecords.push('changed');
  });
  players.addEventListener('removed.test1', function(index, oldRow){
    test.equal(typeof index, 'number');
    test.equal(typeof oldRow, 'object');
    test.equal(arguments.length, 2);
    eventRecords.push('removed');
  });
  Meteor.call('getQueries', function(error, startQueries){
    // NOTE: On server, the result argument of the Meteor method call is
    //       passed by reference, i.e. startQueries===endQueries
    var startQueriesLength = startQueries.length;
    Meteor.call('insPlayer', newPlayer, 100);
    Meteor.setTimeout(function(){
      var newExpected = expectedRows.slice();
      newExpected.unshift({ name: newPlayer, score: 100 });
      test.equal(expectResult(players, newExpected), true, 'Row inserted');
      Meteor.call('delPlayer', newPlayer);
      Meteor.call('getQueries', function(error, endQueries){
        var newQueries = 
          filterPollQueries(endQueries.slice(startQueriesLength));
        test.equal(expectResult(newQueries, [
          /^insert into `players`/i,
          /^select \* from players/i,
          /^delete from `players`/i
        ]), true, 'Only running correct queries');
        Meteor.setTimeout(function(){
          players.removeEventListener(/test1/);
          test.equal(expectResult(eventRecords, [
            'update', 'changed', 'update', 'changed', 'update', 'changed',
            'update', 'changed', 'update', 'added', 'update', 'changed',
            'update', 'changed', 'update', 'changed', 'update', 'changed',
            'update', 'removed']), true, 'Expected events firing');
          test.equal(expectResult(players, expectedRows), true, 'Row removed');
          done();
        }, POLL_WAIT);
      });
    }, POLL_WAIT);
  });
});

Tinytest.addAsync(SUITE_PREFIX + 'Conditional Trigger Update',
function(test, done){
  Meteor.setTimeout(function(){
    test.equal(myScore.length, 1);
    test.equal(myScore[0].score, 60);
    Meteor.call('getQueries', function(error, startQueries){
      // NOTE: On server, the result argument of the Meteor method call is
      //       passed by reference, i.e. startQueries===endQueries
      var startQueriesLength = startQueries.length;
      Meteor.call('setScore', myScore[0].id, 30);
      Meteor.setTimeout(function(){
        Meteor.call('getQueries', function(error, endQueries){
          var newQueries =
            filterPollQueries(endQueries.slice(startQueriesLength));
          test.equal(_.unique(newQueries).length, newQueries.length,
            'Ensure no duplicated queries');
          test.equal(myScore[0].score, 30);
          Meteor.call('setScore', myScore[0].id, 60);
          done();
        });
      }, POLL_WAIT);
    });
  }, POLL_WAIT);
});

testAsyncMulti(SUITE_PREFIX + 'Event Listeners', [
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.cow', function(){ buffer++; });
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Call suffixed listener without specified suffix');
    players.removeEventListener('test');
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Remove suffixed listener without specified suffix');
  },
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.cow', function(){ buffer++; });
    players.dispatchEvent('test.cow');
    test.equal(buffer, 1, 'Call suffixed listener with specified suffix');
    players.removeEventListener('test.cow');
    players.dispatchEvent('test.cow');
    test.equal(buffer, 1, 'Remove suffixed listener with specified suffix');
  },
  function(test, expect){
    var buffer = 1;
    players.addEventListener('cheese', function(value){ buffer+=value; });
    players.dispatchEvent('cheese', 5);
    test.equal(buffer, 6, 'Call non-suffixed listener with argument');
    players.removeEventListener('cheese');
    players.dispatchEvent('cheese');
    test.equal(buffer, 6, 'Remove non-suffixed listener');
  },
  function(test, expect){
    var buffer = 1;
    players.addEventListener('balloon', function(value){ buffer+=value; });
    players.dispatchEvent(/ball/, 5);
    test.equal(buffer, 6, 'Call listener using RegExp');
    players.removeEventListener(/ball/);
    players.dispatchEvent(/ball/);
    test.equal(buffer, 6, 'Remove listener using RegExp');
  },
  function(test, expect){
    var buffer = 0;
    players.addEventListener('test.cow', function(){ buffer++; });
    players.addEventListener('test.horse', function(){ buffer++; return false; });
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Call multiple listeners with halt');
    players.removeEventListener('test');
    players.dispatchEvent('test');
    test.equal(buffer, 1, 'Remove multiple listeners');
  }
]);
