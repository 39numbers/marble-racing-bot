import yaml
from twitchio.ext import commands
import csv
from datetime import datetime
import time
import os.path
import asyncio
import requests
import random
import pandas as pd

import re

#mods can only decide votes
#pick winners
#input to csv
#allow voting times

token = yaml.safe_load(open('config.yaml'))['token']
client_id = yaml.safe_load(open('config.yaml'))['client_id']
client_secret = yaml.safe_load(open('config.yaml'))['client_secret']
client_nick = yaml.safe_load(open('config.yaml'))['client_nick']
intial_channel = yaml.safe_load(open('config.yaml'))['initial_channel']


#set to False by default, votes can only be cast during after mod !start command
allow_votes = False

bot = commands.Bot(
    # set up the bot
    irc_token=token,
    client_id=client_id,
    nick=client_nick,
    prefix='!',
    initial_channels=[intial_channel]
)

@bot.event
async def event_ready():
    'Called once when the bot goes online.'
    print(f"is online!")
    ws = bot._ws  # this is only needed to send messages within event_ready
    await ws.send_privmsg('jetsweep30', f"/me has landed!")

@bot.event
async def event_message(ctx):
    'Runs every time a message is sent in chat.'

    await bot.handle_commands(ctx)


#tesing mic check one,two,three
@bot.command(name='test')
async def test(ctx):
    print('test passed')
    await ctx.send('test passed!')

#votes are empty to start
votes = {}

#allow voting only during the voter registration window
@bot.command(name='color', aliases=['blue', 'yellow', 'red', 'black', 'purple', 'green'])
async def color(ctx):

    vote = ctx.content.split(" ")[0][1:]
    if allow_votes == True:
        votes[ctx.author.name] = vote
        print(votes)
        await ctx.send(f'{ctx.author.name} voted for {vote}')
    else:
        await ctx.send(f'unable to cast votes at this time')


def update_leaderboards():
    x = pd.read_csv('marble_race_results.csv')

    #update daily leaderboard
    daily_leaderboard=x.copy()
    daily_leaderboard['race_date'] = pd.to_datetime(daily_leaderboard['race_datetime']).dt.date
    daily_leaderboard[(daily_leaderboard["race_date"] == datetime.now().strftime('%Y-%m-%d'))] #pd.to_datetime('2021-05-04')

    daily_leaderboard = daily_leaderboard.groupby(['user']).sum()
    daily_leaderboard = daily_leaderboard.sort_values(by='points', ascending=False)[0:5]

    daily_leaderboard.to_csv('daily_leaderboard.txt', header=False, sep=" ")

    #update all_time leaderboard
    all_time_leaderboard = x.groupby(['user']).sum()
    all_time_leaderboard = all_time_leaderboard.sort_values(by='points', ascending=False)[0:3]
    all_time_leaderboard.to_csv('all_time_leaderboard.txt', header=False, sep=" ")

    return 'done'

#declare a winner
@bot.command(name='win', aliases=['Win', 'W', 'w'])
async def win(ctx):
    # reset votes
    if ctx.author.is_mod:
        #get winning color
        winner_color = ctx.content.split(" ")[1]

        #change votes dictionary to DataFrame
        votes_df = pd.DataFrame(votes.items())
        votes_df.columns = ['user', 'color']

        #create won column based on results
        votes_df['won'] = [1 if color == winner_color else 0 for color in votes_df['color']]

        #decide who wins and loses to send for channel message
        winners = [user for user in votes if votes[user] == winner_color]
        not_winners = [user for user in votes if votes[user] != winner_color]

        #set type to race
        votes_df['type'] = 'race'

        #set the time
        votes_df['race_datetime'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        votes_df.to_csv('marble_race_results.csv', index=False, header=False, mode='a')


        update_leaderboards()

        #announce winners
        if len(winners)>0:
            await ctx.send(", ".join(winners) + ' wins')
        else:
            await ctx.send('no one wins')

        #announce not winners
        if len(not_winners)>0:
            await ctx.send(", ".join(not_winners) + ' better luck next time')
        else:
            await ctx.send("no one lost")

    else:
        await ctx.send('only mods can declare a winner')


#start a race
@bot.command(name='start')
async def start(ctx):
    if ctx.author.is_mod:
        global votes
        votes = {}
        global allow_votes
        allow_votes = True
        await ctx.send('voting started, get your votes in!')
        await asyncio.sleep(45) #3
        await ctx.send('45sec remaining')
        await asyncio.sleep(30) #3
        await ctx.send('15sec remaining')
        await asyncio.sleep(10) #3
        await ctx.send('5sec remaining!')
        await asyncio.sleep(5) #3
        await ctx.send('voting closed')
        #await asyncio.sleep(3) #5
        allow_votes = False
    else:
        await ctx.send('only mods can !start the race')


@bot.command(name='give')
async def give(ctx):
    if ctx.author.is_mod:
        give_info = ctx.content.split(" ")
        recipient_name = give_info[1].lower()
        if recipient_name[0] == '@':
            recipient_name = recipient_name[1:]
        recipient_points = give_info[2].lower()
        give_df = pd.DataFrame([[recipient_name,recipient_points,'mod',ctx.author.name]])
        give_df.columns = ['user', 'points','type','color']


        give_df['race_datetime'] = datetime.now().strftime('%Y-%m-%d %H:%M:%S')

        give_df = give_df[['user','color','points','type','race_datetime']]

        give_df.to_csv('marble_race_results.csv', index=False, header=False, mode='a')

        await ctx.send(f'{recipient_name} is given {recipient_points} by {ctx.author.name}')
    else:
        await ctx.send('only mods can give points')

@bot.command(name='points')
async def points(ctx):
    #ctx.author.name
    points = pd.read_csv('marble_race_results.csv')
    score = sum(points[points["user"] == ctx.author.name]['points'])
    await ctx.send(f'{ctx.author.name} has {score} points')


#wager channel points
@bot.command(name='wager')
async def wager(ctx):
    #ctx.author.name


    await ctx.send('this feature not built yet')


if __name__ == "__main__":
    bot.run()
