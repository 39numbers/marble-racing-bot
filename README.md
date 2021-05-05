# marble-racing-bot
A chatbot to tally marble races and capture user votes

# setup (very first time only)
cd marble-racing-bot  
virtualenv -p python3 venv  
. venv/bin/activate  
pip install pandas  
pip install twitchio  
pip install requests
pip install pyyaml

# Config.yaml
Make sure you edit the config.yaml

# Running the code (Do this every time before stream)
cd marble-racing-bot
. venv/bin/activate
python bot.py

You can !test the bot is active
