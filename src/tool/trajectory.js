import * as Cesium from "cesium";
//计算每个点位时间与总时间
const getSiteTimes = (pArr, speed) => {
    let timeSum = 0,
        times = [];
    for (var i = 0; i < pArr.length; i++) {
        if (i == 0) {
            times.push(0); //第0个时间为0
            continue;
        }
        timeSum += spaceDistance([pArr[i - 1], pArr[i]]) / speed;
        times.push(timeSum);
    }
    return {
        timeSum: timeSum,
        siteTimes: times,
    };
};

//计算距离
const spaceDistance = (positions) => {
    let distance = 0;
    for (let i = 0; i < positions.length - 1; i++) {
        let s = Cesium.Cartesian3.distance(positions[i], positions[i + 1])
        distance = distance + s;
    }
    return distance.toFixed(2);
};

//获取飞行的动画点位
const computeCirclularFlight = (pArr, startTime, siteTimes) => {
    let property = new Cesium.SampledPositionProperty();
    for (var i = 0; i < pArr.length; i++) {
        const time = Cesium.JulianDate.addSeconds(startTime, siteTimes[i], new Cesium.JulianDate());
        property.addSample(time, pArr[i]);
    }
    return property;
};

export { getSiteTimes, computeCirclularFlight }
