## Notes and bookmarks

Seems to work from different networks?:

- https://scaledrone.github.io/webrtc/index.html
- [GitHub - ScaleDrone/webrtc-text-chat-tutorial: WebRTC Chat Tutorial for Scaledrone Realtime Messaging Service](https://github.com/ScaleDrone/webrtc-text-chat-tutorial)

Other repos seem good:

- [GitHub - feross/simple-peer: 📡 Simple WebRTC video, voice, and data channels](https://github.com/feross/simple-peer)
- [GitHub - lisajamhoury/WebRTC-Simple-Peer-Examples: A signal server for Simple-Peer with p5 canvas examples. Uses Express and Socket.io for signal server. Ngrok to expose localhost.](https://github.com/lisajamhoury/WebRTC-Simple-Peer-Examples)
  - Console logs seemed to work but nothing happened client-side?

Another repo:

- [GitHub - Dirvann/webrtc-video-conference-simple-peer: A simple video conferencing example using simple-peer](https://github.com/Dirvann/webrtc-video-conference-simple-peer)
- https://dirvann-webrtc-video.herokuapp.com/
  - Their website works out-of-the-box!
  - I cloned and ran it and it worked! Also worked through a remote port. Had to generate my own certificate to put localhost on https, but that just took three minutes. (Three real-life minutes, not theoretical minutes.)

I have a $2 paid account on tunnelto, since ngrok limits you to one connection:

- [GitHub - agrinman/tunnelto: Expose your local web server to the internet with a public URL.](https://github.com/agrinman/tunnelto)

Check if your TCP server is working:

- [TCP Ping - LetMeCheck.it](http://www.letmecheck.it/tcp-ping.php)
- default https port is 443

Nginx configuration:

- [nginc configuration for splashcall · GitHub](https://gist.github.com/qpwo/eb27f6e5479ff42be1f6bedb0c01b497)

Microphones & capacitor:

- [Mozart-Alkhateeb (Mozart Al Khateeb) · GitHub](https://github.com/Mozart-Alkhateeb)
- [GitHub - mozartec/capacitor-microphone: This Microphone API provides the ability to interact with the microphone and record Audio](https://github.com/mozartec/capacitor-microphone)

Common typescript configuration settings with short explanations:

- [common typescript configuration settings with short explanations · GitHub](https://gist.github.com/qpwo/dd0f0b75f3d6142a2bb3bc822527a127)

Snippet for injecting scripts after render in react:

- [React load/inject (module) script dynamically after render of component · GitHub](https://gist.github.com/qpwo/baa35dab5cb597cde3c422671ce8caf3)

Markdown link expander:

- [markdown-link-expander - Visual Studio Marketplace](https://marketplace.visualstudio.com/items?itemName=skn0tt.markdown-link-expander)

WebGL fluid simulation:

- [WebGL Fluid Simulation](https://paveldogreat.github.io/WebGL-Fluid-Simulation/)
- [GitHub - PavelDoGreat/WebGL-Fluid-Simulation: Play with fluids in your browser (works even on mobile)](https://github.com/PavelDoGreat/WebGL-Fluid-Simulation)

Chrome profiler:

- https://developer.chrome.com/docs/devtools/evaluate-performance/
- https://googlechrome.github.io/devtools-samples/jank/

Incomplete fix for fluid simulation lag accumulation (use later):

- https://gist.github.com/qpwo/b573aed46717a4c91c2f96c71af9da4b

Pricing comparison:

- Linode: $10 / month or so, but with bandwidth limits? https://www.linode.com/pricing
  - Base plan ($5) has 1 TB of transfer and 5GBps bandwidth.
  - Thats $0.005/GB!
  - That's bandwidth for ~2000 simultaneous users and transfer for ~23 user-months.
- One user talking through TURN nonstop for a month would use roughly 43GB of bandwidth if it's 1MB/minute.
- Twilio TURN is $0.40 / GB https://www.twilio.com/stun-turn/pricing
- AWS Lambda is $0.09 / GB https://aws.amazon.com/lambda/pricing/#Data_Transfer_.26_Other_Charges
- Firebase is $0.12 / GB https://firebase.google.com/pricing
- DigitalOcean has $0.01/GiB (!!) for droplets & spaces, and $0.10/GiB for their managed solution https://docs.digitalocean.com/products/billing/bandwidth/
- Azure is $0.09/GB https://azure.microsoft.com/en-us/pricing/details/bandwidth/

And auth0 is $23/month for 10k monthly active users: https://auth0.com/pricing

How to use and test turn: https://bloggeek.me/webrtc-turn/

iptables how to list and delete: https://www.digitalocean.com/community/tutorials/how-to-list-and-delete-iptables-firewall-rules

Oh linode does have a kubernetes thing.

- [Deploy and Manage a Cluster with Linode Kubernetes Engine - A Tutorial | Linode](https://www.linode.com/docs/guides/deploy-and-manage-a-cluster-with-linode-kubernetes-engine-a-tutorial/)
- [How to deploy TURN server(coturn) inside Kubernetes - Stack Overflow](https://stackoverflow.com/questions/47524292/how-to-deploy-turn-servercoturn-inside-kubernetes)
- [Orchestrating TURN Servers for Cloud Deployment | CSE Developer Blog](https://devblogs.microsoft.com/cse/2018/01/29/orchestrating-turn-servers-cloud-deployment/)

Use CSS modules instead of Sass:

- [Adding a CSS Modules Stylesheet | Create React App](https://create-react-app.dev/docs/adding-a-css-modules-stylesheet)


Nginx http 2:

- [Setup Nginx with HTTP/2 and Let's Encrypt Certificates on Ubuntu 17.04 | 17.10 • Website for Students](https://websiteforstudents.com/setup-nginx-with-http-2-and-lets-encrypt-certificates-on-ubuntu-17-04-17-10/)

Slack TURN security vulnerability:

- [How we abused Slack's TURN servers to gain access to internal services | Communication Breakdown - real-time communications security](https://www.rtcsec.com/post/2020/04/how-we-abused-slacks-turn-servers-to-gain-access-to-internal-services/)

The profit share thing with basecamp:

- [The deal Jeff Bezos got on Basecamp - Signal v. Noise](https://m.signalvnoise.com/the-deal-jeff-bezos-got-on-basecamp/)

More links on webrtc testing & reliability:

- Adding TCP & UDP queries may increase reliability: [GitHub - webrtc/apprtc: The video chat demo app based on WebRTC. This project is currently on HOLD with minimal maintenance.](https://github.com/webrtc/apprtc#turnstun)
  - And see [CoturnConfig · coturn/coturn Wiki · GitHub](https://github.com/coturn/coturn/wiki/CoturnConfig)
- Browserstack has actual phones on mobile networks for testing! [Simulate network conditions for Appium tests | BrowserStack Docs](https://www.browserstack.com/docs/app-automate/appium/test-real-user-conditions/simulate-network-conditions)
  - Oh idk if you can connect two though
- [WebRTC test: How to go about testing WebRTC? Learn how! • BlogGeek.me](https://bloggeek.me/test-your-webrtc-service/)
- [Do you Need a WebRTC P2P test? • BlogGeek.me](https://bloggeek.me/test-webrtc-p2p/)
- [Main • testRTC](https://testrtc.com/)

Game Ideas:

- symmetry: https://toytheater.com/twirl/
- WebRTC retry stuff <https://bloggeek.me/handling-session-disconnections-in-webrtc/>

- Test webrtc: <https://test.webrtc.org>
All time solution for body resizing unexpectedly:

- <https://stackoverflow.com/questions/39585950/mobile-keyboard-changes-html-viewport-size>

Serve from local host without a tunnel? https://www.vortexhub.io/

So the thing where you automatically add and remove more computers ('nodes') based on load is called autoscaling.

- Linode:
  - https://www.linode.com/community/questions/19274/how-can-i-achieve-autoscaling-on-the-linode-platform
  - https://github.com/meezaan/linode-k8s-autoscaler
- Digital ocean:
  - https://docs.digitalocean.com/products/kubernetes/how-to/autoscale/#autoscaling-in-response-to-heavy-resource-use

Google authentication:

- Add test google accounts: https://console.cloud.google.com/apis/credentials/consent?folder=&organizationId=&project=splashcall-auth
- Get client ID and client secret (also in bitwarden): https://console.cloud.google.com/apis/credentials?project=splashcall-auth&folder=&organizationId=&supportedpurview=project

Drachtio:
- https://hub.docker.com/r/drachtio/drachtio-server/
- https://github.com/andrewvmail/drachtio-webrtc-reference-client

Nginx caching gist: https://gist.github.com/philipstanislaus/654adafad91efb6de230845b5bdeae61

Offline functionality:

- [Cache Busting a React App - DEV Community](https://dev.to/flexdinesh/cache-busting-a-react-app-22lk)
- [How To Make Your Website Work Offline | by Danny Moerkerke | ITNEXT](https://itnext.io/how-to-make-your-website-work-offline-b5be47b92adc)
- [Using Service Workers with create-react-app | by Shaumik Daityari | Bits and Pieces](https://blog.bitsrc.io/using-service-workers-with-react-27a4c5e2d1a9)
- Service workers in capacitor: [Capacitor - build cross platform apps with the web](https://capacitorjs.com/docs/web/progressive-web-apps)
- [Making a Progressive Web App | Create React AppMenuMenu](https://create-react-app.dev/docs/making-a-progressive-web-app/)
- [Workbox  |  Google Developers](https://developers.google.com/web/tools/workbox)
- [GitHub - GoogleChrome/workbox: 📦 Workbox: JavaScript libraries for Progressive Web Apps](https://github.com/GoogleChrome/workbox)
- Example of using workbox to do a bunch of stuff: [pwa/service-worker.ts at master · cra-template/pwa · GitHub](https://github.com/cra-template/pwa/blob/master/packages/cra-template-pwa-typescript/template/src/service-worker.ts)
- [Safari on iOS 14 and iPadOS 14 for PWA and Web Developers － firt.dev](https://firt.dev/ios-14/#what's-new-in-a-nutshell)
