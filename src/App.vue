<template>
  <div class="fromTo">
    <div>{{ data.fromName }}</div>
    <img style="width: 70px" src="/src/assets/image/Right.png" />
    <div>{{ data.toName }}</div>
  </div>
  <div class="carInfo">
    <img @click="changeView('follow')" ref="img" class="img" src="/src/assets/image/bus.png" />
    <div @click="toStation(index)" :style="{ color: index == data.index ? '#f7bd42' : '#fff' }" style=""
      class="itemStation" v-for="(item, index) in data.carInfo.stations" :key="index">
      <span class="num">{{ index + 1 }}</span> {{ item.name }}
    </div>
  </div>
  <div class="control">
    <div class="iconList">
      <el-icon @click="toAdjust('pause')" title="暂停" v-show="data.control.play">
        <VideoPause />
      </el-icon>
      <el-icon @click="toAdjust('play')" title="播放" v-show="!data.control.play">
        <VideoPlay />
      </el-icon>
      <el-icon :style="{ color: data.control.speed == 5 ? '#808080' : '#fff' }" @click="toAdjust('-')" title="X0.5">
        <DArrowLeft />
      </el-icon>
      <el-icon :style="{ color: data.control.speed == 160 ? '#808080' : '#fff' }" @click="toAdjust('+')" title="X2">
        <DArrowRight />
      </el-icon>
      <el-icon title="重播" @click="toAdjust('replay')">
        <Refresh />
      </el-icon>
      <el-button type="primary" @click="changeView('follow')">跟随视角</el-button>
      <el-button type="primary" @click="changeView('incar')">车内视角</el-button>
      <el-button type="primary" @click="changeView('free')">自由视角</el-button>
      <span class="speed">{{ data.control.speed }} <span style="font-size: 15px;">m/s</span> </span>
    </div>
    <el-progress style="margin-top: 15px" striped-flow :percentage="data.control.percentage" :stroke-width="12"
      :show-text="false" />
  </div>
  <div id="cesiumContainer"></div>
</template>
<script setup>
import {
  VideoPause,
  VideoPlay,
  DArrowRight,
  DArrowLeft,
  Refresh,
} from "@element-plus/icons-vue";
import * as Cesium from "cesium";
import { onMounted, reactive, ref } from "vue";
import loadData from "./assets/load.json";
import modifyMap from "./tool/filterColor";
import { getSiteTimes, computeCirclularFlight } from "./tool/trajectory";
import Bubble from "./tool/bubbleCar";

let viewer, animateEntity, bubble, pickLabel, timeObj;
let positions = [], isInCar = false, isBegin = false;
const img = ref("");

const data = reactive({
  carInfo: {},
  index: 0,
  fromName: "",
  toName: "",
  control: {
    play: false,
    speed: 20,
    percentage: 0,
  },
});

const toAdjust = (type) => {
  if (data.control.speed != 5 && type == "-") {
    data.control.speed /= 2;
    viewer.clockViewModel.multiplier /= 2;
  } else if (data.control.speed != 160 && type == "+") {
    data.control.speed *= 2;
    viewer.clockViewModel.multiplier *= 2;
  } else if (type == "play" || type == "replay") {
    if (type == "replay") {
      img.value.style.top = "10px";
      img.value.style.left = "17px";
      data.control.percentage = 0;
      data.index = 0;
      viewer.clock.currentTime = viewer.clock.startTime;
    }
    if (!isBegin) {
      isBegin = true;
      toBegin();
    }
    data.control.play = true;
    viewer.clock.shouldAnimate = true;
  } else if (type == "pause") {
    data.control.play = false;
    viewer.clock.shouldAnimate = false;
  }
};

const changeView = (type) => {
  if (type == "incar") {
    isInCar = true;
  } else if (type == "follow") {
    isInCar = false;
    viewer.trackedEntity = animateEntity;
  } else if (type == "free") {
    isInCar = false;
    viewer.trackedEntity = null;
    viewer.camera.lookAtTransform(Cesium.Matrix4.IDENTITY);
  }
};

const toStation = (index) => {
  changeView("free");
  if (pickLabel) {
    pickLabel.label.fillColor = Cesium.Color.WHITE;
  }
  pickLabel = viewer.entities.getById("label" + index);
  pickLabel.label.fillColor = Cesium.Color.YELLOW;
  viewer.flyTo(pickLabel);
};

const initData = () => {
  let xArr = loadData.xs.split(",");
  let yArr = loadData.ys.split(",");
  xArr.forEach((item, index) => {
    positions.push(
      Cesium.Cartesian3.fromDegrees(Number(item), Number(yArr[index]), 0)
    );
  });
  const line = viewer.entities.add({
    polyline: {
      positions: positions,
      width: 10,
      material: Cesium.Color.WHITE.withAlpha(0.8),
      clampToGround: true,
    },
  });
  data.carInfo = loadData;
  data.fromName = loadData.stations[0].name;
  data.toName = loadData.stations[1].name;
  loadData.stations.forEach((item, index) => {
    let xy = item.xy_coords.split(";").map((a) => Number(a));
    const position = Cesium.Cartesian3.fromDegrees(...xy, 0);
    const positionLabel = Cesium.Cartesian3.fromDegrees(...xy, 24);
    const orientation = Cesium.Transforms.headingPitchRollQuaternion(
      position,
      Cesium.HeadingPitchRoll.fromDegrees(90, 0, 0)
    );
    viewer.entities.add({
      position,
      orientation,
      model: {
        scale: 0.07,
        uri: "/src/assets/model.gltf",
        minimumPixelSize: 30,
      },
    });
    viewer.entities.add({
      position: positionLabel,
      id: "label" + index,
      label: {
        text: item.name,
        font: "10px Helvetica",
        style: Cesium.LabelStyle.FILL_AND_OUTLINE,
        fillColor: Cesium.Color.WHITE, //字体颜色
        backgroundColor: Cesium.Color.BLACK.withAlpha(0.5), //背景颜色
        showBackground: true, //是否显示背景颜色
      },
    });
    viewer.flyTo(line);
  });
};

const toBegin = () => {
  timeObj = getSiteTimes(positions, 20);
  let startTime = Cesium.JulianDate.fromDate(new Date(2015, 1, 1, 8));
  let stopTime = Cesium.JulianDate.addSeconds(
    startTime,
    timeObj.timeSum,
    new Cesium.JulianDate()
  );
  viewer.clock.startTime = startTime.clone();
  viewer.clock.stopTime = stopTime.clone();
  viewer.clock.currentTime = startTime.clone();
  let property = computeCirclularFlight(
    positions,
    startTime,
    timeObj.siteTimes
  );
  animateEntity = viewer.entities.add({
    availability: new Cesium.TimeIntervalCollection([
      new Cesium.TimeInterval({
        start: startTime,
        stop: stopTime,
      }),
    ]),
    position: property,
    orientation: new Cesium.VelocityOrientationProperty(property),
    model: {
      scale: 1.2,
      uri: "/src/assets/bus.gltf",
      minimumPixelSize: 40,
    },
  });
  viewer.trackedEntity = animateEntity;
  data.carInfo.peopleNum = Math.ceil(Math.random() * (30 - 10)) + 10;
  img.value.style.top = "10px";
  img.value.style.left = "17px";
  data.control.percentage = 0;
  data.index = 0;
  bubble = new Bubble({
    viewer: viewer,
    carInfo: data.carInfo,
  });
  viewer.clock.onTick.addEventListener(tickEventHandler);
};

onMounted(() => {
  Cesium.Ion.defaultAccessToken =
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiI5ZGJlOTBmMi0xYjNmLTRhMzYtOTlhMy0zNGIwOGUyNGFkYTUiLCJpZCI6MTE1MTg3LCJpYXQiOjE2Njg2NzM2NTB9.kQwPYh1h1KTzNcwTFkoW36f8DpbDGhdDhrpzHHFUfTk";

  const layer = new Cesium.UrlTemplateImageryProvider({
    url: "http://webrd02.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}",
    minimumLevel: 4,
    maximumLevel: 18,
  });
  // viewer 是所有API的开始
  viewer = new Cesium.Viewer("cesiumContainer", {
    imageryProvider: layer,
    baseLayerPicker: false, //是否显示图层选择控件
    animation: false, //是否显示动画控件
    timeline: false, //是否显示时间轴控件
    fullscreenButton: false, //是否显示全屏按钮
    geocoder: false, //是否显示搜索按钮
    homeButton: false, //是否显示主页按钮
    navigationHelpButton: false, //是否显示帮助提示按钮
    sceneModePicker: false, //是否显示投影方式按钮
    shouldAnimate: true,
  });
  modifyMap(viewer, {
    //反色?
    invertColor: true,
    //滤色值
    filterRGB: [70.0, 110.0, 120.0],
  });
  initData();
});

const tickEventHandler = () => {
  const time = Cesium.JulianDate.secondsDifference(
    viewer.clock.currentTime,
    Cesium.JulianDate.fromDate(new Date(2015, 1, 1, 8))
  );
  data.control.percentage = (time / timeObj.timeSum).toFixed(5) * 100;
  let startPosition = animateEntity.position.getValue(viewer.clock.currentTime);
  let cartographic = Cesium.Cartographic.fromCartesian(startPosition);
  let lon = Cesium.Math.toDegrees(cartographic.longitude);
  let lat = Cesium.Math.toDegrees(cartographic.latitude);
  let newPosition = Cesium.Cartesian3.fromDegrees(lon, lat, 2);
  bubble.changePosition(newPosition);
  let endPosition = new Cesium.Cartesian3.fromDegrees(
    ...loadData.stations[data.index + 1].xy_coords
      .split(";")
      .map((a) => Number(a))
  );
  let distance = Cesium.Cartesian3.distance(startPosition, endPosition);
  if (distance < 10) {
    data.index += 1;
    if (data.index > 13) {
      img.value.style.top = "165px";
      img.value.style.left = 17 + (data.index - 14) * 32.85 + "px";
    } else {
      img.value.style.left = 17 + data.index * 32.85 + "px";
    }
    if (data.index == loadData.stations.length - 1) {
      removeEvent();
      return;
    }
    data.fromName = loadData.stations[data.index].name;
    data.toName = loadData.stations[data.index + 1].name;
    data.carInfo.peopleNum = Math.ceil(Math.random() * (30 - 10)) + 10;
    viewer.clock.shouldAnimate = false;
    setTimeout(() => {
      viewer.clock.shouldAnimate = true;
    }, 1000);
  }
  if (isInCar) {
    viewer.trackedEntity = null;
    let orientation = animateEntity.orientation.getValue(viewer.clock.currentTime);
    let transform = Cesium.Matrix4.fromRotationTranslation(
      Cesium.Matrix3.fromQuaternion(orientation),
      newPosition
    );
    viewer.camera.lookAtTransform(transform, new Cesium.Cartesian3(-0.0001, 0.0, 0.0));
  }
};

const removeEvent = () => {
  bubble.windowClose();
  viewer.clock.onTick.removeEventListener(tickEventHandler);
  viewer.entities.remove(animateEntity);
  changeView("free");
  isBegin = false;
  data.control.play = false;
  viewer.clock.shouldAnimate = false;
};

document.addEventListener("visibilitychange", () => {
  if (document.hidden) {
    viewer.clock.shouldAnimate = false;
    data.control.play = false;
  }
});
</script>
<style scoped>
#cesiumContainer {
  width: 100vw;
  height: 100vh;
  overflow: hidden;
}

.fromTo {
  display: flex;
  position: absolute;
  right: 0.5%;
  width: 480px;
  height: 70px;
  top: 10%;
  z-index: 999;
  background-color: rgb(4, 12, 46);
  padding: 10px 15px 10px;
  border: 1px solid #4f7cb1;
  justify-content: space-between;
  align-items: center;
}

.fromTo div {
  color: #fff;
  font-size: 20px;
  line-height: 70px;
}

.carInfo {
  position: absolute;
  top: 20%;
  right: 0.5%;
  z-index: 999;
  background-color: #13396a;
  padding: 10px 15px 10px;
  width: 480px;
  height: 356px;
  overflow: hidden;
}

.itemStation {
  color: #fff;
  font-size: 14px;
  float: left;
  width: 25px;
  height: 123px;
  text-align: center;
  font-family: "Microsoft YaHei", 微软雅黑;
  line-height: 14px;
  cursor: pointer;
  word-break: normal;
  overflow: hidden;
  margin: 25px 4px 10px 4px;
}

.img {
  width: 30px;
  position: absolute;
  transition: all 0.7s ease 0s;
  left: 17px;
  cursor: pointer;
  z-index: 1;
  backface-visibility: hidden;
  display: block;
}

.num {
  display: inline-block;
  width: 20px;
  font-family: arial;
  padding-bottom: 6px;
  cursor: pointer;
}

.control {
  position: absolute;
  padding: 10px 15px 10px;
  right: 0.5%;
  width: 480px;
  height: 90px;
  top: 60%;
  z-index: 999;
  background-color: rgb(4, 12, 46);
  border: 1px solid #4f7cb1;
}

.iconList {
  color: #fff;
  font-size: 33px;
  margin-top: 5px;
}

.el-icon {
  margin-right: 6px;
  cursor: pointer;
}

.el-icon:hover {
  color: #7c4dff !important;
}

.speed {
  float: right;
  margin-top: 3px;
  font-size: 16px;
}

.el-button--primary {
  padding: 0 5px;
  margin-top: -12px;
}
</style>
