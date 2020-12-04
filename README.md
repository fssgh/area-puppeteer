# area-puppeteer
基于 @dwqs/area-puppeteer 的中国行政区域抓取爬虫，数据同步到国家统计局2020年12月01日，优化地区code 的格式化（最精准），优化抓取失败时重试逻辑（不会因多次失败而终止程序），台湾/香港/澳门调整为省级数据。

## 数据来源
* 国家统计局：[统计用区划代码和城乡划分代码](http://www.stats.gov.cn/tjsj/tjbz/tjyqhdmhcxhfdm/2018/index.html)
* 国家民政部：[中华人民共和国行政区划代码](http://www.mca.gov.cn/article/sj/tjbz/a/)

## 数据更新

```
npm i
npm start // 生成市县区数据
npm run format // 格式化数据
```

生成的数据包含两份：`cities.js` 和 `areas.js`，前者是市级数据，后者是县区数据

格式化后会生成两份数据：`pca.js` 和 `pcaa.js`，前者仅省市数据，后者包含省市区数据

```js
import Data from 'path/to/pcaa';

Data['86']
// 所有省份：{'11': '北京市', '12': '天津市', '13': '河北省', ...}

Data['13']
// 对应省份的所有城市：{'1301': '石家庄市', '1302': '唐山市', '1303': '秦皇岛市', ...}

Data['1302']
// 对应市的所有县区：{'130201': '市辖区', '130202': '路南区', '130203': '路北区', ...}
```

## License
This repo is released under the [WTFPL](http://www.wtfpl.net/).