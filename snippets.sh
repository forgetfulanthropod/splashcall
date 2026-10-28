#from root
f=frontend/public/i/cards/Doodle

# resize image to specified width:
for f in $(ls *-844.png); do
    sips --resampleWidth 200 $f.png --out $f-200.png
done

# reduce number of colors of png:
for f in $(ls *-422.png); do
    pngquant 64 --skip-if-larger --strip --ext=.png --force $f-200.png
done

# create a new PR and link it to an existing issue:
hub pull-request -i <ISSUE_NUMBER>
# install hub: https://github.com/defunkt/hub

# you can safely alias git to hub in bashrc/zshrc/fishrc. You'll have all the git commands plus github commands.
eval "$(hub alias -s)"


# drachtio:
docker run -d --rm --name drachtio -p 5060:5060 -p 9022:9022 drachtio/drachtio-server drachtio --contact "sip:*;transport=tcp,udp"


# generate dependency graph
cd frontend
NODE_ENV="development" \
  npx dependency-cruiser \
  --webpack-config node_modules/react-scripts/config/webpack.config.js \
  --include-only "^src" \
  --output-type dot src/App.tsx \
  | dot -T svg > dependencies.svg
open dependencies.svg
