// 格式化数据
const path = require('path');
const fs = require('fs');
const _ = require('lodash');
const puppeteer = require('puppeteer');
const ora = require('ora');
const chalk = require('chalk');
const awaitTo = require('async-await-error-handling');

const { timeout, writeFileSync,writeTextFileSync } = require('./utils');

const provinces = require('./provinces');
const cities = require('./cities');
const areas = require('./areas');
const pcodes = Object.keys(provinces['86']);

/** 
 * 四个直辖市会将「市辖区」作为二级行政区域
 * 重庆市会将「县」作为二级行政区域
 * 河北省/河南省/湖北省/海南省 等省份会将「省直辖县级行政区划」作为第二级行政区域
 * 新疆会将「自治区直辖县级行政区划」作为第二级行政区域
 * 出于实用性考虑，省市联动会过滤掉这些，直接用第二级行政区域补充
*/
const filter = ['市辖区', '县', '省直辖县级行政区划', '自治区直辖县级行政区划'];

// 省市
const pca = {
    '86': provinces['86']
};
// 删除港澳
delete pca['86']['81'];
delete pca['86']['82'];

// 省市区
const pcaa = {
    '86': provinces['86']
};

// 提取行政区域 code
const reg = /0(?=0{2,})/;
const target = 'http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2020/#{route}.html';

const spinner = ora({
    color: 'yellow'
});


function formatCode (code,level) {
	if(level===1){
		return code.slice(0, 2);
	}else if(level===2){
		return code.slice(0, 4);
	}else if(level===3){
		return code.slice(0, 6);
	}else if(level===4){
		return code.slice(0, 9);
	}else{
		return code;
	}
}

// 省市联动
function formatPCAddress () {
    pcodes.forEach(pcode => {
        if (pcode === '71') {
            // 台湾
            pca[pcode] = provinces['7101'];
        } else if (pcode === '81') {
            // 香港
            pca['86']['81'] = provinces['81'];
            pca['8101'] = provinces['8101'];
        }  else if (pcode === '82') {
            // 澳门
            pca['86']['82'] = provinces['82'];
            pca['8201'] = provinces['8201'];
        }else {
            const res = {};
            const pcities = cities.filter(city => city.parentCode === pcode);
            pcities.forEach(city => {
                if (filter.includes(city.text)) {
                    // 用第三级区域数据补充
                    const tmps = areas.filter(area => area.parentCode === city.code);
                    tmps.forEach(tmp => {
                        res[formatCode(tmp.code,3)] = tmp.text.indexOf('办事处') > -1 ? tmp.text.slice(0, -3) : tmp.text;
                    })
                } else {
                    res[formatCode(city.code,2)] = city.text;
                }
            });
            pca[pcode] = res;
        }
    });
    writeFileSync('pca.js', pca);
}

// 因为部分原处于第三级的区域提升到第二级，所以要重新抓取这部分区域对应的下一级区域数据
let url = '';
async function getAreasByCCode (page, code, text) {
    const pCode = code.substr(0, 2);
    const cCodeSuffix = code.substr(2, 2);

    url = target.replace('#{route}', `${pCode}/${cCodeSuffix}/${code}`);
    await page.goto(url);
    let res = [];

    spinner.text = console.log(chalk.blue(`正在抓取 ${text} 的县区数据：${url}`));

    res = await page.evaluate((text) => {
        const list = [...document.querySelectorAll('.towntable .towntr')];

        if (!list.length) {
            console.log(`\n\n${text} 下没有县区数据\n\n`);
        }

        return list.map(el => {
            const t = el.innerText.split('\t');
            return {
                code: t[0].slice(0, 9),
                text: t[1]
            }
        });
    }, text);

    return res;
}

// 省市区联动
async function formatPCAAddress () {
    const browser = await puppeteer.launch();
    const page = await browser.newPage();

    // 保留市辖区
    const f = filter.slice(1);
    for (let p = 0, pl = pcodes.length; p < pl; p++) {
        const pcode = pcodes[p];
        if (pcode === '71') {
            // 台湾
            pcaa[pcode] = provinces[pcode];
            pcaa['7101'] = provinces['7101'];
        }else if (pcode === '81') {
            // 香港
            pca['86']['81'] = provinces['81'];
            pca['8101'] = provinces['8101'];
        }  else if (pcode === '82') {
            // 澳门
            pca['86']['82'] = provinces['82'];
            pca['8201'] = provinces['8201'];
        }else {
            const res = {};
            const pcities = cities.filter(city => city.parentCode === pcode);
            for(let c = 0, cl = pcities.length; c < cl; c++) {
                const pcity = pcities[c];
                const pareas = areas.filter(area => area.parentCode === pcity.code);

                if (f.includes(pcity.text)) {
                    // 用第三级区域数据补充到第二级
                    for(let i = 0, l = pareas.length; i < l; i++) {
                        const pCurAreas = {};
                        const parea = pareas[i];
                        const code = formatCode(parea.code,3);
                        res[code] = parea.text.indexOf('办事处') > -1 ? parea.text.slice(0, -3) : parea.text;

                        // 抓取第四级数据
                        let [err, data] = await awaitTo(getAreasByCCode(page, code, res[code]));
                        if (err) {
                            // 这个重试主要是处理因避免耗时(Navigation Timeout Exceeded)导致的错误
                            console.log('\n', chalk.red(`抓取数据失败，失败链接: ${url}，错误信息: ${err.message}，正在重试....\n`));
							i--;
							continue;
                        }
                        spinner.succeed(chalk.green(`市级城市 ${res[code]} 的县区数据抓取完毕.`));
                        if (data.length) {
                            console.log('ddddd', data[0]);
                            data.forEach(item => {
                                if (item.text !== '市辖区') {
                                    pCurAreas[formatCode(item.code,4)] = item.text.indexOf('办事处') > -1 ? item.text.slice(0, -3) : item.text;
                                }
                            });
                            pcaa[code] = pCurAreas;
                        }
                        await timeout(1000);
                    }
                } else {
                    const curAreas = {};
                    const cityCode = formatCode(pcity.code,2);
                    res[cityCode] = pcity.text;

                    // 第三级数据
                    pareas.forEach(parea => {
                        if (parea.text !== '市辖区') {
                            curAreas[formatCode(parea.code, 3)] = parea.text.indexOf('办事处') > -1 ? parea.text.slice(0, -3) : parea.text;
                        }
                    });
                    pcaa[cityCode] = curAreas;
                }
            }
            pcaa[pcode] = res;
        }
    }

    writeFileSync('pcaa.js', pcaa);
    await browser.close();
}
// 数据库导入格式
function formatCSV (){
    const allAddrs = _.concat(cities,areas); 
    let csvText='code,text,parentCode\n';
    _.forEach(allAddrs,(item) => {
        csvText+=item.code+','+item.text+','+item.parentCode+'\n';
    });
    writeTextFileSync('pcaa.csv', csvText);
}

//formatPCAddress();
//formatPCAAddress();
formatCSV();