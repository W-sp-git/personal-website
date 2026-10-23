// Landscape renderer: photographic day/night pairs, gentle depth, water and aurora.
// Native WebGL keeps the background independent from the text and navigation.
const VERTEX = `
attribute vec2 aPosition;
varying vec2 vUv;
void main(){vUv=aPosition*0.5+0.5;gl_Position=vec4(aPosition,0.0,1.0);}
`;
const FRAGMENT = `
precision mediump float;
varying vec2 vUv;
uniform sampler2D uDay0; uniform sampler2D uNight0;
uniform sampler2D uDay1; uniform sampler2D uNight1;
uniform sampler2D uDay2; uniform sampler2D uNight2;
uniform vec2 uResolution; uniform vec2 uPointer;
uniform float uTime; uniform float uLight; uniform float uChapter;
uniform float uMotion; uniform vec3 uRipple[8];
vec2 cover(vec2 uv){
  float screen=uResolution.x/uResolution.y;
  float image=1.5;
  if(screen>image) uv.y=(uv.y-0.5)*(image/screen)+0.5;
  else uv.x=(uv.x-0.5)*(screen/image)+0.5;
  return uv;
}
void main(){
  vec2 screenUv=vUv;
  float water=(1.0-smoothstep(0.34,0.40,screenUv.y));
  float snow=1.0-smoothstep(0.0,0.7,abs(uChapter-1.0));
  water*=1.0-snow;
  vec2 uv=cover(vUv);
  float camera=1.025+0.013*sin(uChapter*3.14159);
  uv=(uv-0.5)/camera+0.5;
  float depth=mix(1.0,0.32,smoothstep(0.2,0.78,vUv.y));
  uv+=uPointer*0.008*depth*uMotion;
  float waves=sin(vUv.y*150.0+uTime*0.8)*sin(vUv.x*36.0+uTime*0.29);
  uv.x+=waves*0.00045*water*uMotion;
  uv.y+=sin(vUv.y*110.0-uTime*0.45)*0.00018*water*uMotion;
  float shimmer=0.0;
  for(int i=0;i<8;i++){
    float age=uTime-uRipple[i].z;
    vec2 delta=screenUv-uRipple[i].xy;
    delta.x*=uResolution.x/uResolution.y;
    float d=length(delta);
    float radius=age*0.075;
    float envelope=exp(-pow((d-radius)*65.0,2.0))*exp(-age*0.9);
    float active=step(0.0,age)*(1.0-step(5.0,age));
    float ring=sin((d-radius)*155.0)*envelope*active;
    uv+=normalize(delta+vec2(0.00001))*ring*0.006*water;
    shimmer+=ring*0.045*water;
  }
  uv=clamp(uv,0.001,0.999);
  float sky=smoothstep(0.60,0.94,vUv.y);
  vec2 nightUv=uv;
  nightUv.x+=sin(vUv.y*6.0+uTime*0.10)*0.0018*sky*uLight*uMotion;
  vec3 first=mix(texture2D(uDay0,uv).rgb,texture2D(uNight0,nightUv).rgb,uLight);
  vec3 second=mix(texture2D(uDay1,uv).rgb,texture2D(uNight1,uv).rgb,uLight);
  vec3 third=mix(texture2D(uDay2,uv).rgb,texture2D(uNight2,nightUv).rgb,uLight);
  float blend1=smoothstep(0.16,0.84,uChapter);
  float blend2=smoothstep(1.16,1.84,uChapter);
  vec3 color=mix(mix(first,second,blend1),third,blend2);
  float fog=pow(sin(fract(uChapter)*3.14159),12.0)*0.09;
  color=mix(color,vec3(0.37,0.48,0.57),fog);
  color+=shimmer;
  float vignette=1.0-0.12*pow(length((screenUv-0.5)*vec2(1.0,0.8)),1.5);
  gl_FragColor=vec4(color*vignette,1.0);
}
`;

export class Landscape {
  constructor(canvas, images) {
    this.canvas = canvas;
    this.images = images;
    this.gl = null;
    this.time = 0;
    this.motion = true;
    this.chapter = 0;
    this.targetChapter = 0;
    this.light = 0.6;
    this.targetLight = 0.6;
    this.pointer = [0, 0];
    this.targetPointer = [0, 0];
    this.ripples = Array.from({ length: 8 }, () => [-1, -1, -100]);
    this.rippleData = new Float32Array(24);
    this.rippleIndex = 0;
    this.frame = 0;
    this.lastFrame = 0;
    this.draws = 0;
    this.dirty = true;
    this.onVisibility = () => {
      this.lastFrame = 0;
      if (!document.hidden) this.start();
      else {
        cancelAnimationFrame(this.frame);
        this.frame = 0;
      }
    };
    document.addEventListener("visibilitychange", this.onVisibility);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      this.canvas.classList.remove("ready");
      this.gl = null;
      document.documentElement.classList.add("no-webgl");
    });
    canvas.addEventListener("webglcontextrestored", () => this.initialize());
  }

  async load() {
    const all = this.images.map((image) => {
      if (image.dataset.src) image.src = image.dataset.src;
      return image.decode().catch(() => null);
    });
    await Promise.all(all);
    if (!this.images.every((image) => image.naturalWidth > 0)) {
      document.documentElement.classList.add("no-webgl");
      this.start();
      return false;
    }
    this.initialize();
    this.start();
    return true;
  }

  initialize() {
    try {
      const gl = this.canvas.getContext("webgl", {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        preserveDrawingBuffer: false,
        powerPreference: "low-power",
      });
      if (!gl) throw new Error("WebGL unavailable");
      this.gl = gl;
      const compile = (type, source) => {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
          gl.deleteShader(shader);
          throw new Error("Landscape shader unavailable");
        }
        return shader;
      };
      const vertex = compile(gl.VERTEX_SHADER, VERTEX);
      const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
      this.program = gl.createProgram();
      gl.attachShader(this.program, vertex);
      gl.attachShader(this.program, fragment);
      gl.linkProgram(this.program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(this.program, gl.LINK_STATUS))
        throw new Error("Landscape program unavailable");
      gl.useProgram(this.program);
      const buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(
        gl.ARRAY_BUFFER,
        new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
        gl.STATIC_DRAW,
      );
      const position = gl.getAttribLocation(this.program, "aPosition");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      this.images.forEach((image, index) => {
        gl.activeTexture(gl.TEXTURE0 + index);
        const texture = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texImage2D(
          gl.TEXTURE_2D,
          0,
          gl.RGB,
          gl.RGB,
          gl.UNSIGNED_BYTE,
          image,
        );
        gl.uniform1i(
          gl.getUniformLocation(
            this.program,
            `u${index % 2 === 0 ? "Day" : "Night"}${Math.floor(index / 2)}`,
          ),
          index,
        );
      });
      this.uniforms = Object.fromEntries(
        [
          "uResolution",
          "uPointer",
          "uTime",
          "uLight",
          "uChapter",
          "uMotion",
          "uRipple[0]",
        ].map((name) => [name, gl.getUniformLocation(this.program, name)]),
      );
      this.resize();
      this.canvas.classList.add("ready");
      document.documentElement.classList.remove("no-webgl");
    } catch {
      this.gl = null;
      document.documentElement.classList.add("no-webgl");
    }
  }

  resize() {
    const ratio = Math.min(
      devicePixelRatio || 1,
      innerWidth < 768 ? 1.25 : 1.2,
      1600 / innerWidth,
      1100 / innerHeight,
    );
    this.canvas.width = Math.round(innerWidth * ratio);
    this.canvas.height = Math.round(innerHeight * ratio);
    if (this.gl) this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.dirty = true;
    this.start();
  }

  ripple(x, y) {
    if (!this.motion) return;
    this.ripples[this.rippleIndex] = [x, y, this.time];
    this.rippleIndex = (this.rippleIndex + 1) % 8;
    this.dirty = true;
    this.start();
  }

  setMotion(enabled) {
    this.motion = enabled;
    if (!enabled) {
      this.pointer = [0, 0];
      this.targetPointer = [0, 0];
      this.ripples.forEach((r) => (r[2] = -100));
    }
    this.dirty = true;
    this.start();
  }

  setLight(value) {
    this.targetLight = value;
    this.dirty = true;
    this.start();
  }
  setChapter(value) {
    this.targetChapter = Math.max(0, Math.min(2, value));
    this.dirty = true;
    this.start();
  }

  start() {
    if (!this.frame && !document.hidden)
      this.frame = requestAnimationFrame((timestamp) => this.tick(timestamp));
  }

  tick(timestamp) {
    this.frame = 0;
    if (this.motion && this.lastFrame && timestamp - this.lastFrame < 30) {
      this.start();
      return;
    }
    const elapsed = this.lastFrame
      ? Math.min((timestamp - this.lastFrame) / 1000, 0.05)
      : 0.016;
    this.lastFrame = timestamp;
    if (this.motion) this.time += elapsed;
    const easing = this.motion ? 1 - Math.exp(-elapsed * 8) : 1;
    this.light += (this.targetLight - this.light) * easing;
    this.chapter += (this.targetChapter - this.chapter) * easing;
    this.pointer[0] += (this.targetPointer[0] - this.pointer[0]) * easing;
    this.pointer[1] += (this.targetPointer[1] - this.pointer[1]) * easing;
    if (Math.abs(this.chapter - this.targetChapter) < 0.0001)
      this.chapter = this.targetChapter;
    if (Math.abs(this.light - this.targetLight) < 0.0001)
      this.light = this.targetLight;
    this.updateFallback();
    const gl = this.gl;
    if (gl) {
      gl.useProgram(this.program);
      gl.uniform2f(
        this.uniforms.uResolution,
        this.canvas.width,
        this.canvas.height,
      );
      gl.uniform2fv(this.uniforms.uPointer, this.pointer);
      gl.uniform1f(this.uniforms.uTime, this.time);
      gl.uniform1f(this.uniforms.uLight, this.light);
      gl.uniform1f(this.uniforms.uChapter, this.chapter);
      gl.uniform1f(this.uniforms.uMotion, this.motion ? 1 : 0);
      gl.uniform3fv(
        this.uniforms["uRipple[0]"],
        this.rippleData,
      );
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      this.draws++;
    }
    const unsettled =
      Math.abs(this.light - this.targetLight) > 0.0001 ||
      Math.abs(this.chapter - this.targetChapter) > 0.0001;
    if (this.motion || unsettled) this.start();
    else this.lastFrame = 0;
    this.dirty = false;
  }

  updateFallback() {
    this.ripples.forEach((ripple, index) => this.rippleData.set(ripple, index * 3));
    if (this.lastFallbackLight === this.light && this.lastFallbackChapter === this.chapter) return;
    this.lastFallbackLight = this.light;
    this.lastFallbackChapter = this.chapter;
    // Keep the photographic fallback in sync even if the GPU context is lost.
    const smooth = (value) => {
      const t = Math.max(0, Math.min(1, value));
      return t * t * (3 - 2 * t);
    };
    const b1 = smooth((this.chapter - 0.16) / 0.68);
    const b2 = smooth((this.chapter - 1.16) / 0.68);
    const sceneWeights = [(1 - b1) * (1 - b2), b1 * (1 - b2), b2];
    this.images.forEach((image, i) => {
      image.style.opacity =
        sceneWeights[Math.floor(i / 2)] * (i % 2 ? this.light : 1 - this.light);
    });
  }
}

export class Snowfall {
  constructor(canvas, landscape) {
    this.canvas = canvas;
    this.landscape = landscape;
    this.context = canvas.getContext("2d");
    this.frame = 0;
    this.last = 0;
    this.flakes = Array.from({ length: innerWidth < 768 ? 18 : 38 }, () => ({
      x: Math.random(),
      y: Math.random(),
      size: Math.random() * 1.2 + 0.4,
      speed: Math.random() * 0.025 + 0.012,
    }));
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(canvas.parentElement);
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) this.start();
    });
    this.resize();
  }
  resize() {
    const dpr = Math.min(devicePixelRatio || 1, 1.5);
    this.width = innerWidth;
    this.height = innerHeight;
    this.canvas.width = innerWidth * dpr;
    this.canvas.height = innerHeight * dpr;
    this.context?.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.start();
  }
  start() {
    if (!this.frame && !document.hidden)
      this.frame = requestAnimationFrame((t) => this.tick(t));
  }
  tick(t) {
    this.frame = 0;
    const elapsed = this.last ? Math.min((t - this.last) / 1000, 0.05) : 0.016;
    this.last = t;
    const ctx = this.context;
    if (!ctx) return;
    ctx.clearRect(0, 0, this.width, this.height);
    const strength = Math.max(
      0,
      1 - Math.abs(this.landscape.chapter - 1) * 1.6,
    );
    if (
      this.landscape.motion &&
      strength > 0.02 &&
      document.documentElement.dataset.page === "home"
    ) {
      ctx.fillStyle = `rgba(230,240,245,${strength * 0.43})`;
      for (const f of this.flakes) {
        f.y += f.speed * elapsed;
        f.x += 0.011 * elapsed;
        if (f.y > 1.03) f.y = -0.03;
        if (f.x > 1.03) f.x = -0.03;
        ctx.beginPath();
        ctx.arc(f.x * this.width, f.y * this.height, f.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    if (this.landscape.motion && !document.hidden) this.start();
    else this.last = 0;
  }
}
