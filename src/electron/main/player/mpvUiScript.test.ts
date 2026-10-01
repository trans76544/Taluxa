// @vitest-environment node

import { beforeAll, describe, expect, it } from 'vitest';
import {
  captureMpvUiScript, mpvLuaAvailable, mpvLuaUnavailableReason, runMpvLuaChunk, runMpvUiLua,
} from '../../../test/helpers/mpvLuaHarness';

// Read the emitted ASS rectangles, rather than reproducing the Lua layout algorithm.
const inspectBottomGeometry = String.raw`
  local function button(id)
    for _, item in ipairs(buttons) do if item.id == id then return item end end
    error('missing actual button ' .. id)
  end
  local function rendered_rect(color, alpha, height, center_y)
    for header, path in overlay.data:gmatch('{([^{}]+)}m ([^{}]+){\\p0}') do
      if header:find('\\c&H' .. color .. '&', 1, true)
        and header:find('\\alpha&H' .. alpha .. '&', 1, true) then
        local coords = {}
        for number in path:gmatch('%-?%d+') do coords[#coords + 1] = tonumber(number) end
        if #coords == 8 and coords[2] == coords[4] and coords[6] == coords[8]
          and coords[6] - coords[2] == height and (coords[2] + coords[6])/2 == center_y then
          return {x1=coords[1], y1=coords[2], x2=coords[3], y2=coords[6]}
        end
      end
    end
    error('missing rendered rectangle ' .. color .. '/' .. alpha .. '/' .. height)
  end
  local function measure_bottom(expected_width)
    local hit = button('volume')
    local center_y = (hit.y1 + hit.y2)/2
    local track = rendered_rect('CFCFCF', '73', 6, center_y)
    local knob = rendered_rect('FF7716', '00', 14, center_y)
    local fill = rendered_rect('FF7716', '00', 8, center_y)
    h.eq(track.x2 - track.x1, expected_width, 'actual ASS volume track length')
    h.eq(volume_track_left, track.x1, 'input left matches ASS')
    h.eq(volume_track_right, track.x2, 'input right matches ASS')
    h.eq(hit.x1, track.x1 - 14, 'left hit padding')
    h.eq(hit.x2, track.x2 + 14, 'right hit padding')
    h.eq(hit.y2 - hit.y1, 36, 'volume hit height preserved')
    h.eq(knob.x2 - knob.x1, 14, 'knob diameter preserved')
    h.eq((knob.x1 + knob.x2)/2, fill.x2, 'knob follows rendered fill')
    h.eq(fill.x1, track.x1)
    assert(knob.x1 - button('mute').x2 >= 8, 'visible knob clears mute by 8')
    assert(button('speed').x1 - knob.x2 >= 8, 'visible knob clears speed by 8')
    assert(button('mute').x2 < hit.x1, 'mute and volume hit regions strictly disjoint')
    assert(hit.x2 < button('speed').x1, 'volume and speed hit regions strictly disjoint')
    local order = {'prev','play','next','mute','volume','speed','audio','sub','danmaku','settings'}
    if episode_selector_enabled then order[#order + 1] = 'episodes' end
    order[#order + 1] = 'fullscreen'
    local previous = nil
    for _, id in ipairs(order) do
      local item = button(id)
      assert(item.x1 >= 0 and item.x2 <= UI_WIDTH, id .. ' fits logical width')
      if previous then assert(previous.x2 < item.x1, 'actual bottom hit rectangles overlap at ' .. id) end
      if id ~= 'volume' then
        h.eq(item.y2 - item.y1, 58, id .. ' height preserved')
        if id == 'speed' then h.eq(item.x2 - item.x1, 77, 'speed width preserved')
        else assert(item.x2 - item.x1 >= 40 and item.x2 - item.x1 <= 58, id .. ' horizontal width') end
      end
      previous = item
    end
    local seek = button('seek')
    h.eq(seek.x1, 74, 'independent progress left')
    h.eq(seek.x2, UI_WIDTH - 90, 'independent progress right')
    local progress_track = rendered_rect('CFCFCF', '50', 2, (seek.y1 + seek.y2)/2)
    h.eq(progress_track.x1, 74, 'actual progress ASS left')
    h.eq(progress_track.x2, UI_WIDTH - 90, 'actual progress ASS right')
    assert(overlay.data:find('\\pos(24,' .. (UI_HEIGHT - 126) .. ')\\fs30', 1, true), 'title coordinates and font preserved')
    return track, knob, hit
  end
`;

const inspectPointerActions = String.raw`
  local function point(x, y)
    h.properties['mouse-pos'] = {x=x * raw_osd_width/UI_WIDTH, y=y * raw_osd_height/UI_HEIGHT}
  end
  local function center_button(id)
    local item = button(id)
    point((item.x1+item.x2)/2, (item.y1+item.y2)/2)
  end
  local function click_button(id)
    center_button(id)
    h.bindings['taluxa-click']({event='press'})
  end
  local function rendered_text(x, y, font_size)
    local position = '\\pos(' .. x .. ',' .. y .. ')\\fs' .. font_size
    for header, label in overlay.data:gmatch('{([^{}]+)}([^{}\n]*)') do
      if header:find(position, 1, true) then return label end
    end
    error('missing actual text at ' .. position)
  end
  local function assert_no_neighbor_action()
    h.eq(menu_open, nil, 'volume input cannot open a neighboring menu')
    h.eq(episode_panel_open, false, 'volume input cannot open episodes')
    for _, command in ipairs(h.commands) do
      h.eq(command[1], 'set', 'volume input only issues a set command')
      h.eq(command[2], 'volume', 'volume input cannot change neighboring controls')
    end
  end
  local function size(width, height, dpi)
    h.properties['osd-width'] = width*dpi
    h.properties['osd-height'] = height*dpi
    h.observe('display-hidpi-scale', dpi)
  end
`;

describe.skipIf(!mpvLuaAvailable)(`generated mpv UI Lua${mpvLuaAvailable ? '' : ` (${mpvLuaUnavailableReason})`}`, () => {
  let movie: string;
  let series: string;
  beforeAll(async () => {
    movie = await captureMpvUiScript();
    series = await captureMpvUiScript({ currentItemId: 'test-item', episodes: [
      { itemId: 'test-item', title: 'Episode 1', thumbnailPath: 'cached.bgra', thumbnailWidth: 128, thumbnailHeight: 72, thumbnailStride: 512 },
      { itemId: 'episode-2', title: 'Episode 2' },
    ] });
  });

  it.each(['movie', 'series'].flatMap((kind) => [0, 50, 100].map((value) => ({ kind, value }))))(
    'renders a 96px loading volume track with separate neighbors for $kind at $value%', async ({ kind, value }) => {
      await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}
        volume = ${value}
        h.messages['taluxa-startup-state']('loading', 'Loading test media...')
        local track, knob = measure_bottom(96)
        h.eq(track.x1, 294, 'reference track left')
        h.eq(track.x2, 390, 'reference track right')
        h.eq((knob.x1 + knob.x2)/2, ${294 + Math.floor(96 * value / 100)}, 'actual knob position')
        assert(overlay.data:find('Loading test media...', 1, true), 'loading hint remains visible')
        assert(overlay.data:find('\\\\pos(480,254)\\\\fs28', 1, true), 'loading hint placement and font preserved')
      `);
    },
  );

  it.each([
    { kind: 'movie', width: 640, length: 64, left: 218, right: 282, speed: 303, icon: 43, fullscreen: 575 },
    { kind: 'series', width: 640, length: 64, left: 205, right: 269, speed: 285, icon: 40, fullscreen: 580 },
    { kind: 'movie', width: 960, length: 96, left: 294, right: 390, speed: 483, icon: 58, fullscreen: 866 },
    { kind: 'series', width: 960, length: 96, left: 294, right: 390, speed: 420, icon: 58, fullscreen: 866 },
    { kind: 'movie', width: 1280, length: 128, left: 294, right: 422, speed: 803, icon: 58, fullscreen: 1186 },
    { kind: 'series', width: 1280, length: 128, left: 294, right: 422, speed: 740, icon: 58, fullscreen: 1186 },
    { kind: 'movie', width: 1920, length: 144, left: 294, right: 438, speed: 1443, icon: 58, fullscreen: 1826 },
    { kind: 'series', width: 1920, length: 144, left: 294, right: 438, speed: 1380, icon: 58, fullscreen: 1826 },
  ])('keeps actual $kind controls disjoint at $width across volume and DPI matrix', async (reference) => {
    await runMpvUiLua(reference.kind === 'movie' ? movie : series, `${inspectBottomGeometry}
      for _, dpi in ipairs({1,1.5,2}) do
        h.properties['osd-height'] = 360 * dpi
        h.properties['display-hidpi-scale'] = dpi
        h.observe('osd-width', ${reference.width} * dpi)
        h.eq(UI_WIDTH, ${reference.width})
        h.eq(UI_HEIGHT, 360)
        for _, value in ipairs({0,50,100}) do
          h.observe('volume', value)
          local track, knob, hit = measure_bottom(${reference.length})
          h.eq(track.x1, ${reference.left}, 'reference rendered left')
          h.eq(track.x2, ${reference.right}, 'reference rendered right')
          h.eq(hit.x1, ${reference.left - 14}, 'reference hit left')
          h.eq(hit.x2, ${reference.right + 14}, 'reference hit right')
          h.eq(button('speed').x1, ${reference.speed}, 'reference speed left')
          h.eq(button('fullscreen').x1, ${reference.fullscreen}, 'reference fullscreen left')
          h.eq(button('fullscreen').x2, ${reference.fullscreen + reference.icon}, 'reference fullscreen right')
          h.eq(button('prev').x2-button('prev').x1, ${reference.icon}, 'reference horizontal icon width')
          h.eq((knob.x1+knob.x2)/2, ${reference.left} + math.floor(${reference.length} * value/100), 'rendered knob follows volume')
          local prev = button('prev')
          assert(overlay.data:find('\\\\pos(' .. (prev.x1 + math.floor((prev.x2-prev.x1)/2)) .. ',' .. (prev.y1 + 30) .. ')\\\\fs34', 1, true), 'icon drawing center matches actual horizontal hit rectangle')
        end
      end
    `);
  });

  it.each(['movie', 'series'])('safely calculates edges and retains proportional rounding for %s', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}
      local below_minimum = get_bottom_layout(639)
      h.eq(below_minimum.volume_width, 64, 'below supported minimum still calculates safely')
      assert(below_minimum.icon_width >= 40, 'minimum horizontal region')
      assert(below_minimum.speed_x == below_minimum.speed_x, 'finite layout')
      for _, edge in ipairs({{640,64},{950,95},{951,95},{1440,144},{1441,144}}) do
        h.observe('osd-width', edge[1])
        measure_bottom(edge[2])
      end
      -- Half-pixel rounding remains continuous at the 10% threshold.
      h.observe('osd-width', 954)
      measure_bottom(95)
      h.observe('osd-width', 955)
      measure_bottom(96)
    `);
  });

  it.each(['movie', 'series'])('keeps all nine %s speed menu choices inside a minimum-height canvas', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}
      for _, dpi in ipairs({1,1.5,2}) do
        for _, size in ipairs({{640,360,28},{960,540,37}}) do
          h.properties['osd-width'] = size[1] * dpi
          h.properties['osd-height'] = size[2] * dpi
          h.observe('display-hidpi-scale', dpi)
          menu_open = 'speed'
          draw_controls()
          local options = {}
          for _, item in ipairs(buttons) do
            if item.id == 'speed-option' then options[#options+1] = item end
          end
          h.eq(#options, 9, 'every existing speed choice remains available')
          local last = nil
          for _, item in ipairs(options) do
            assert(item.y1 >= 0, 'speed option ' .. tostring(item.value) .. ' clips above canvas')
            assert(item.y2 < button('speed').y1, 'menu stays above bottom controls')
            assert(item.x1 >= 0 and item.x2 <= UI_WIDTH, 'speed option fits width')
            h.eq(item.y2-item.y1, size[3], 'adaptive speed row height')
            if last then h.eq(last.y2, item.y1, 'menu rows remain contiguous') end
            local center_x = item.x1+math.floor((item.x2-item.x1)/2)
            local center_y = item.y1+math.floor((item.y2-item.y1)/2)+1
            assert(overlay.data:find('\\\\pos(' .. center_x .. ',' .. center_y .. ')\\\\fs22', 1, true), 'actual menu label retains font size and row center')
            last = item
          end
          local first = options[1]
          local panel = rendered_rect('101010', '80', last.y2-first.y1, (last.y2+first.y1)/2)
          h.eq(panel.y1, first.y1, 'ASS panel and input rows agree')
          h.eq(panel.y2, last.y2)
          local speed = button('speed')
          h.eq(panel.x1+math.floor((panel.x2-panel.x1)/2), speed.x1+math.floor((speed.x2-speed.x1)/2), 'speed panel anchors to actual button center')
          menu_open = nil
        end
      end
    `);
  });

  it.each(['movie', 'series'])('reuses stable geometry through real %s lifecycle messages and observations', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}
      h.observe('volume', 37)
      h.observe('mute', true)
      local function geometry()
        local track, knob = measure_bottom(96)
        local entries = {track.x1, track.x2, knob.x1, knob.x2}
        for _, item in ipairs(buttons) do
          if item.id ~= 'retry' then
            entries[#entries+1] = item.id .. ':' .. item.x1 .. ':' .. item.x2 .. ':' .. item.y1 .. ':' .. item.y2
          end
        end
        return table.concat(entries, '|')
      end
      local initial = geometry()
      h.clear_commands()
      h.eq(h.properties['video-params'], nil, 'loading starts without video dimensions')
      for _, state in ipairs({'preparing','loading','failed','playing'}) do
        local updates = overlay.updates
        h.messages['taluxa-startup-state'](state, 'Lifecycle test ' .. state)
        assert(overlay.updates > updates, 'startup message redraws immediately')
        h.eq(geometry(), initial, 'startup state preserves actual geometry')
        if state ~= 'playing' then assert(overlay.data:find('Lifecycle test ' .. state, 1, true)) end
      end
      h.properties['video-params'] = {w=1920,h=1080,aspect=16/9}
      h.observe('duration', 600)
      h.observe('time-pos', 25)
      h.eq(geometry(), initial, 'first-frame video dimensions preserve window geometry')
      h.properties['video-params'] = {w=1080,h=1920,aspect=9/16}
      h.observe('time-pos', 26)
      h.eq(geometry(), initial, 'media aspect change preserves window geometry')
      h.messages['taluxa-active-episode']('next-item','Next media','Next display','Next subtitle')
      h.eq(geometry(), initial, 'active media message preserves actual geometry')
      if episode_selector_enabled then
        h.messages['taluxa-episode-selector']('{"currentItemId":"next-item","episodes":[{"itemId":"next-item","title":"Next episode"},{"itemId":"last-item","title":"Last episode"}]}')
        h.eq(geometry(), initial, 'selector refresh preserves actual geometry')
      end
      for _, dpi in ipairs({1.5,2,1}) do
        h.properties['osd-width'] = 960 * dpi
        h.properties['osd-height'] = 540 * dpi
        local updates = overlay.updates
        h.observe('display-hidpi-scale', dpi)
        assert(overlay.updates > updates, 'DPI observation redraws immediately')
        h.eq(geometry(), initial, 'same logical size preserves lifecycle geometry')
      end
      for _, size in ipairs({{640,360,64},{1280,720,128},{1920,1080,144},{960,540,96}}) do
        -- Simulate ordinary, maximized and fullscreen surfaces through the actual OSD observers.
        h.properties['osd-height'] = size[2]
        local updates = overlay.updates
        h.observe('osd-width', size[1])
        assert(overlay.updates > updates, 'width observation redraws immediately')
        measure_bottom(size[3])
        updates = overlay.updates
        h.observe('osd-height', size[2])
        assert(overlay.updates > updates, 'height observation redraws immediately')
      end
      h.eq(geometry(), initial, 'returning window restores actual geometry')
      h.eq(volume, 37, 'geometry never changes volume')
      h.eq(muted, true, 'geometry never changes mute')
      h.eq(#h.find_commands('set','volume'), 0)
      h.eq(#h.find_commands('set','mute'), 0)
      h.eq(#h.find_commands('cycle','mute'), 0)
      h.eq(#h.find_commands('script-message','taluxa-settings-patch'), 0)
      h.eq(#h.find_commands('loadfile'), 0, 'geometry never reloads media')
    `);
  });

  it.each(['movie', 'series'])('executes the actual %s rendering and existing volume/button actions', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `
      assert(overlay.data:find('Test media', 1, true), 'actual title must render')
      assert(overlay.updates > 0, 'actual overlay must update')
      h.eq(episode_selector_enabled, ${kind === 'series'})
      local layout = get_bottom_layout(UI_WIDTH)
      h.eq(volume_track_left, layout.volume_x)
      h.eq(volume_track_right, layout.volume_x + layout.volume_width)
      local function center(id)
        for _, button in ipairs(buttons) do
          if button.id == id then return {x=(button.x1+button.x2)/2, y=(button.y1+button.y2)/2} end
        end
        error('missing button ' .. id)
      end
      h.clear_commands()
      h.properties['mouse-pos'] = center('volume')
      h.bindings['taluxa-click']({event='down'})
      h.eq(h.find_commands('set','volume')[1][3], 50, 'midpoint volume')
      h.bindings['taluxa-click']({event='up'})
      h.clear_commands()
      h.properties['mouse-pos'] = center('mute')
      h.bindings['taluxa-click']({event='press'})
      h.eq(#h.find_commands('cycle','mute'), 1)
      h.clear_commands()
      h.properties['mouse-pos'] = center('speed')
      h.bindings['taluxa-click']({event='press'})
      h.eq(menu_open, 'speed')
      h.eq(#h.find_commands('set','volume'), 0)
    `);
  });

  it.each(['movie', 'series'])('maps actual %s volume callbacks at five percentages across width and DPI', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}${inspectPointerActions}
      for _, width in ipairs({640,960,1280,1920}) do
        for _, dpi in ipairs({1,1.5,2}) do
          size(width, 360, dpi)
          local track = measure_bottom(math.min(144, math.max(64, width/10)))
          local item = button('volume')
          for _, percent in ipairs({0,25,50,75,100}) do
            h.clear_commands()
            point(track.x1+(track.x2-track.x1)*percent/100, (item.y1+item.y2)/2)
            h.bindings['taluxa-click']({event='down'})
            h.eq(volume_dragging, true, 'down captures volume drag')
            h.bindings['taluxa-click']({event='up'})
            h.eq(volume_dragging, false, 'up ends capture')
            local commands = h.find_commands('set','volume')
            h.eq(#commands, 2, 'down and up both apply current pointer')
            for _, command in ipairs(commands) do
              assert(math.abs(command[3]-percent) <= 1, 'percentage error exceeds one')
            end
            assert_no_neighbor_action()
          end
        end
      end
    `);
  });

  it.each(['movie', 'series'].flatMap((kind) => ['click', 'down', 'press', 'wheel', 'move'].map((handler) => ({ kind, handler }))))(
    'refreshes $kind geometry before $handler input when observers have not run', async ({ kind, handler }) => {
      await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}${inspectPointerActions}
        for _, width in ipairs({640,960,1280,1920}) do
          for _, dpi in ipairs({1,1.5,2}) do
            -- Save coordinates from the actual future drawing, then restore the old snapshot.
            size(width, 360, dpi)
            local target = button('${handler === 'wheel' ? 'speed' : 'volume'}')
            local x = (target.x1+target.x2)/2
            local y = (target.y1+target.y2)/2
            local left, right = volume_track_left, volume_track_right
            size(960, 540, 1)
            if '${handler}' == 'move' then
              center_button('volume')
              h.bindings['taluxa-click']({event='down'})
            end
            h.clear_commands()
            h.properties['osd-width'] = width*dpi
            h.properties['osd-height'] = 360*dpi
            h.properties['display-hidpi-scale'] = dpi
            h.properties['mouse-pos'] = {x=x*dpi, y=y*dpi}
            local updates = overlay.updates
            if '${handler}' == 'click' then handle_click()
            elseif '${handler}' == 'wheel' then h.bindings['taluxa-wheel-up']()
            elseif '${handler}' == 'move' then h.bindings['taluxa-mouse-move']()
            else h.bindings['taluxa-click']({event='${handler}'}) end
            h.eq(UI_WIDTH, width, 'input refreshes logical width')
            h.eq(UI_HEIGHT, 360, 'input refreshes logical height')
            h.eq(raw_osd_width, width*dpi, 'input refreshes raw width')
            h.eq(raw_osd_height, 360*dpi, 'input refreshes raw height')
            h.eq(ui_dpi_scale, dpi, 'input refreshes cached DPI')
            h.eq(overlay.res_x, width)
            h.eq(overlay.res_y, 360)
            h.eq(volume_track_left, left, 'input endpoints match future drawing')
            h.eq(volume_track_right, right)
            assert(overlay.updates > updates, 'geometry redraw is immediate before hover timer')
            local pos = normalize_mouse_pos(h.properties['mouse-pos'])
            h.near(pos.x, x, 'pointer and drawing use the same snapshot')
            h.near(pos.y, y)
            if '${handler}' == 'wheel' then
              h.eq(#h.find_commands('add','speed'), 1, 'wheel hits speed in new geometry')
              h.eq(#h.find_commands('add','volume'), 0)
            else
              h.eq(#h.find_commands('set','volume'), 1, 'new midpoint hits only volume')
              h.eq(h.find_commands('set','volume')[1][3], 50, 'current endpoints map midpoint')
              assert_no_neighbor_action()
            end
            h.bindings['taluxa-click']({event='up',canceled=true})
          end
        end
      `);
    },
  );

  it.each(['movie', 'series'])('keeps %s volume capture through outside releases and cancellation', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}${inspectPointerActions}
      for _, dpi in ipairs({1,1.5,2}) do
        size(640, 360, dpi)
        for _, neighbor in ipairs({'mute','speed','audio'}) do
          h.clear_commands()
          center_button('volume')
          h.bindings['taluxa-click']({event='down'})
          center_button(neighbor)
          h.bindings['taluxa-click']({event='up'})
          h.eq(volume_dragging, false)
          h.eq(h.find_commands('set','volume')[2][3], neighbor == 'mute' and 0 or 100, 'release clamps outside track')
          assert_no_neighbor_action()
        end
        for _, edge in ipairs({{-500,0},{UI_WIDTH+500,100}}) do
          center_button('volume')
          h.bindings['taluxa-click']({event='down'})
          h.clear_commands()
          point(edge[1], -500)
          h.bindings['taluxa-mouse-move']()
          h.eq(h.find_commands('set','volume')[1][3], edge[2], 'outside drag clamps at endpoint')
          h.bindings['taluxa-click']({event='up'})
          h.eq(volume_dragging, false)
          assert_no_neighbor_action()
        end
        for _, absent in ipairs({false,true}) do
          center_button('volume')
          h.bindings['taluxa-click']({event='down'})
          h.clear_commands()
          if absent then h.properties['mouse-pos'] = nil else center_button('speed') end
          h.bindings['taluxa-click']({event='up',canceled=true})
          h.eq(volume_dragging, false, 'canceled up always clears drag even without position')
          h.eq(#h.commands, 0, 'cancel does not write volume or trigger neighbor')
          center_button('audio')
          h.bindings['taluxa-mouse-move']()
          h.eq(#h.find_commands('set','volume'), 0, 'move after cancel cannot continue old capture')
          click_button('speed')
          h.eq(menu_open, 'speed', 'input works again after cancellation')
          click_button('speed')
        end
      end
    `);
  });

  it.each(['click', 'down', 'press', 'wheel', 'move'])('refreshes raw DPI snapshot at unchanged logical size before %s', async (handler) => {
    await runMpvUiLua(series, `${inspectBottomGeometry}${inspectPointerActions}
      size(640, 360, 1)
      h.observe('volume', 37)
      h.observe('mute', true)
      for _, dpi in ipairs({1.5,2,1}) do
        menu_open = nil
        draw_controls()
        local item = button('speed')
        local x, y = (item.x1+item.x2)/2, (item.y1+item.y2)/2
        local left, right = volume_track_left, volume_track_right
        h.clear_commands()
        h.properties['osd-width'] = 640*dpi
        h.properties['osd-height'] = 360*dpi
        h.properties['display-hidpi-scale'] = dpi
        h.properties['mouse-pos'] = {x=x*dpi,y=y*dpi}
        local updates = overlay.updates
        if '${handler}' == 'click' then handle_click()
        elseif '${handler}' == 'wheel' then h.bindings['taluxa-wheel-up']()
        elseif '${handler}' == 'move' then h.bindings['taluxa-mouse-move']()
        else h.bindings['taluxa-click']({event='${handler}'}) end
        h.eq(UI_WIDTH, 640)
        h.eq(UI_HEIGHT, 360)
        h.eq(raw_osd_width, 640*dpi, 'raw width refreshed despite unchanged logical width')
        h.eq(raw_osd_height, 360*dpi)
        h.eq(ui_dpi_scale, dpi)
        h.eq(volume_track_left, left)
        h.eq(volume_track_right, right)
        assert(overlay.updates > updates, 'raw snapshot change redraws immediately')
        h.eq(volume, 37, 'refresh preserves playback volume')
        h.eq(muted, true, 'refresh preserves mute')
        h.eq(#h.find_commands('set','volume'), 0)
        h.eq(#h.find_commands('cycle','mute'), 0)
        h.eq(#h.find_commands('script-message','taluxa-settings-patch'), 0)
        local normalized = normalize_mouse_pos(h.properties['mouse-pos'])
        h.near(normalized.x, x)
        h.near(normalized.y, y)
        if '${handler}' == 'wheel' then h.eq(#h.find_commands('add','speed'), 1)
        elseif '${handler}' ~= 'move' then h.eq(menu_open, 'speed', 'new raw pointer hits existing speed') end
      end
    `);
  });

  it('keeps normal hover redraws at 16ms while a pending timer cannot delay changed geometry', async () => {
    await runMpvUiLua(movie, `${inspectBottomGeometry}${inspectPointerActions}
      h.observe('volume', 37)
      h.observe('mute', true)
      h.timers = {}
      center_button('volume')
      local updates = overlay.updates
      h.bindings['taluxa-mouse-move']()
      h.bindings['taluxa-mouse-move']()
      h.eq(overlay.updates, updates, 'ordinary hover remains deferred')
      h.eq(#h.timers, 1, 'ordinary moves coalesce into one redraw')
      h.eq(h.timers[1].delay, 0.016, 'hover retains 16ms throttle')
      h.properties['osd-width'] = 1280*2
      h.properties['osd-height'] = 720*2
      h.properties['display-hidpi-scale'] = 2
      h.clear_commands()
      h.bindings['taluxa-mouse-move']()
      h.eq(UI_WIDTH, 1280)
      h.eq(UI_HEIGHT, 720)
      h.eq(overlay.updates, updates+1, 'changed geometry redraws before pending timer')
      h.eq(#h.timers, 1, 'geometry refresh does not add another hover timer')
      measure_bottom(128)
      h.flush_timers()
      h.eq(overlay.updates, updates+2, 'pending hover draws latest geometry')
      h.eq(hover_redraw_pending, false)
      h.eq(volume, 37)
      h.eq(muted, true)
      h.eq(#h.commands, 0, 'geometry and hover do not alter playback or saved settings')
    `);
  });

  it.each(['movie', 'series'])('updates %s captured drag endpoints through resize and DPI before observers', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, `${inspectBottomGeometry}${inspectPointerActions}
      for _, width in ipairs({640,960,1280,1920}) do
        for _, dpi in ipairs({1,1.5,2}) do
          size(width, 360, dpi)
          local left, right = volume_track_left, volume_track_right
          local item = button('volume')
          local y = (item.y1+item.y2)/2
          for _, percent in ipairs({0,25,50,75,100}) do
            size(960, 540, 1)
            center_button('volume')
            h.bindings['taluxa-click']({event='down'})
            h.eq(volume_dragging, true)
            h.clear_commands()
            h.properties['osd-width'] = width*dpi
            h.properties['osd-height'] = 360*dpi
            h.properties['display-hidpi-scale'] = dpi
            h.properties['mouse-pos'] = {x=(left+(right-left)*percent/100)*dpi,y=y*dpi}
            h.bindings['taluxa-mouse-move']()
            h.eq(volume_track_left, left)
            h.eq(volume_track_right, right)
            h.eq(volume_dragging, true, 'resize preserves drag capture')
            h.eq(#h.find_commands('set','volume'), 1, 'refresh itself never writes volume')
            assert(math.abs(h.find_commands('set','volume')[1][3]-percent) <= 1, 'resized drag percentage error exceeds one')
            assert_no_neighbor_action()
            h.bindings['taluxa-click']({event='up',canceled=true})
            h.eq(volume_dragging, false)
          end
        end
      end
    `);
  });

  it.each(['movie', 'series'])('keeps %s mute, knob prompts, wheel and neighboring actions working at every width/DPI', async (kind) => {
    await runMpvUiLua(kind === 'movie' ? movie : series, String.raw`${inspectBottomGeometry}${inspectPointerActions}
      h.observe('track-list', {{type='audio',id=2,title='Test audio'},{type='sub',id=3,title='Test subtitle'}})
      for _, width in ipairs({640,960,1280,1920}) do
        for _, dpi in ipairs({1,1.5,2}) do
          size(width, 360, dpi)
          h.clear_commands()
          click_button('mute')
          h.eq(#h.find_commands('cycle','mute'), 1, 'mute callback remains usable')
          h.observe('mute', true)
          h.observe('volume', 37)
          local track, knob = measure_bottom(math.min(144, math.max(64, width/10)))
          local knob_x = (knob.x1+knob.x2)/2
          h.eq(knob_x, track.x1+math.floor((track.x2-track.x1)*0.37), 'volume observer positions actual knob')
          local mute_button = button('mute')
          local mute_center = mute_button.x1+math.floor((mute_button.x2-mute_button.x1)/2)
          h.eq(rendered_text(mute_center, mute_button.y1+30, 34), 'x', 'mute observer renders muted icon')
          point(knob_x, (button('volume').y1+button('volume').y2)/2)
          h.bindings['taluxa-mouse-move']()
          h.flush_timers()
          h.eq(rendered_text(knob_x, (button('volume').y1+button('volume').y2)/2-28, 16), '37%', 'hover prompt follows observed volume and knob')
          h.observe('mute', false)
          h.eq(muted, false)
          assert(rendered_text(mute_center, mute_button.y1+30, 34) ~= 'x', 'mute observer restores unmuted icon')
          h.clear_commands()
          center_button('volume')
          h.bindings['taluxa-wheel-up']()
          h.bindings['taluxa-wheel-down']()
          local wheel = h.find_commands('add','volume')
          h.eq(#wheel, 2)
          h.eq(wheel[1][3], '5', 'wheel up keeps existing volume step')
          h.eq(wheel[2][3], '-5', 'wheel down keeps existing volume step')
          center_button('speed')
          h.bindings['taluxa-wheel-up']()
          h.bindings['taluxa-wheel-down']()
          wheel = h.find_commands('add','speed')
          h.eq(wheel[1][3], '0.25')
          h.eq(wheel[2][3], '-0.25')
          click_button('speed')
          h.eq(menu_open, 'speed')
          local choice = button('speed-option').value
          click_button('speed-option')
          h.eq(menu_open, nil)
          h.eq(h.find_commands('set','speed')[1][3], tostring(choice), 'speed choice uses existing command')
          click_button('audio')
          h.eq(menu_open, 'audio')
          click_button('audio-option')
          h.eq(h.find_commands('set','aid')[1][3], '2', 'audio choice uses existing command')
          h.eq(menu_open, nil)
          click_button('settings')
          h.eq(menu_open, 'settings')
          click_button('settings-stats')
          h.eq(h.find_commands('script-binding','stats/display-stats-toggle')[1][1], 'script-binding')
          h.eq(menu_open, nil)
          click_button('sub')
          h.eq(#h.find_commands('cycle','sid'), 1)
          click_button('danmaku')
          h.eq(#h.find_commands('cycle','secondary-sid'), 1)
          h.eq(#h.find_commands('show-text'), 1)
          if episode_selector_enabled then
            click_button('episodes')
            h.eq(episode_panel_open, true, 'series episode button opens panel')
            click_button('episodes')
            h.eq(episode_panel_open, false)
            click_button('next')
            local selected = h.find_commands('script-message','taluxa-select-episode')
            h.eq(#selected, 1)
            h.eq(selected[1][3], 'episode-2')
          end
          click_button('fullscreen')
          h.eq(#h.find_commands('cycle','fullscreen'), 1)
          h.eq(#h.find_commands('set','volume'), 0, 'neighbor actions never change track value')
        end
      end
    `);
  });

  it('rejects a Lua assertion failure', async () => {
    await expect(runMpvUiLua(movie, "error('intentional assertion failure')")).rejects.toThrow('intentional assertion failure');
  });

  it('rejects a missing result even when mpv exits successfully', async () => {
    await expect(runMpvLuaChunk("require('mp').commandv('quit', '0')")).rejects.toThrow('Expected one TALUXA_LUA_RESULT');
  });

  it('rejects a failing result even when mpv exits successfully', async () => {
    await expect(runMpvLuaChunk(`
      print('TALUXA_LUA_RESULT:{"passed":false,"error":"failure with exit zero"}')
      require('mp').commandv('quit', '0')
    `)).rejects.toThrow('Lua assertions failed: failure with exit zero');
  });

  it('rejects invalid result JSON', async () => {
    await expect(runMpvLuaChunk(`
      print('TALUXA_LUA_RESULT:invalid-json')
      require('mp').commandv('quit', '0')
    `)).rejects.toThrow();
  });

  it('rejects a timed out Lua execution', async () => {
    await expect(runMpvLuaChunk('while true do end', { timeoutMs: 250 })).rejects.toThrow('mpv Lua execution failed');
  });

  it('reports an actionable missing Windows runtime', async () => {
    await expect(runMpvLuaChunk('', { runtimePath: 'missing-mpv-lua-runtime.exe' })).rejects.toThrow('Restore vendor/mpv/windows-x64/mpv.exe');
  });

  it.each([1, 1.5, 2])('uses one 960x540 logical canvas and matching pointer snapshot at DPI %s', async (dpi) => {
    await runMpvUiLua(movie, `
      h.eq(UI_WIDTH, 960, 'logical width')
      h.eq(UI_HEIGHT, 540, 'logical height')
      h.eq(overlay.res_x, 960, 'ASS width')
      h.eq(overlay.res_y, 540, 'ASS height')
      h.eq(raw_osd_width, ${960 * dpi}, 'cached raw width')
      h.eq(raw_osd_height, ${540 * dpi}, 'cached raw height')
      h.eq(ui_dpi_scale, ${dpi}, 'cached DPI')
      local pos = normalize_mouse_pos({x=${321 * dpi}, y=${234 * dpi}})
      h.near(pos.x, 321, 'logical pointer x')
      h.near(pos.y, 234, 'logical pointer y')
      h.eq(update_ui_dimensions(), false, 'unchanged snapshot')
      -- Pointer normalization cannot combine a fresh raw size with old logical dimensions.
      h.properties['osd-width'] = 3000
      h.properties['osd-height'] = 1800
      pos = normalize_mouse_pos({x=${321 * dpi}, y=${234 * dpi}})
      h.near(pos.x, 321, 'pointer uses cached width')
      h.near(pos.y, 234, 'pointer uses cached height')
    `, { properties: { 'osd-width': 960 * dpi, 'osd-height': 540 * dpi, 'display-hidpi-scale': dpi } });
  });

  it.each(['nil', '0', '0/0', 'math.huge', '-math.huge'])('falls back to DPI 1 for %s', async (invalid) => {
    await runMpvUiLua(movie, `
      h.properties['display-hidpi-scale'] = ${invalid}
      update_ui_dimensions()
      h.eq(ui_dpi_scale, 1, 'invalid DPI fallback')
      h.eq(UI_WIDTH, 960)
      h.eq(UI_HEIGHT, 540)
      h.near(normalize_mouse_pos({x=123,y=45}).x, 123)
    `);
  });

  it('preserves valid raw dimensions through missing/zero/nonfinite observations', async () => {
    await runMpvUiLua(movie, `
      for _, invalid in ipairs({0, -1, 0/0, math.huge, -math.huge}) do
        h.properties['osd-width'] = invalid
        h.properties['osd-height'] = invalid
        h.eq(update_ui_dimensions(), false, 'invalid raw size does not change snapshot')
        h.eq(UI_WIDTH, 960)
        h.eq(UI_HEIGHT, 540)
        h.eq(raw_osd_width, 960)
        h.eq(raw_osd_height, 540)
      end
      h.properties['osd-width'] = nil
      h.properties['osd-height'] = nil
      h.eq(update_ui_dimensions(), false)
      h.eq(UI_WIDTH, 960)
      h.eq(UI_HEIGHT, 540)
    `);
  });

  it('uses initial 1920x1080 defaults and clamps rounded logical dimensions to at least 1', async () => {
    await runMpvUiLua(movie, `
      h.eq(UI_WIDTH, 1920, 'initial fallback width')
      h.eq(UI_HEIGHT, 1080, 'initial fallback height')
      h.properties['osd-width'] = 1
      h.properties['osd-height'] = 1
      h.properties['display-hidpi-scale'] = 3
      h.eq(update_ui_dimensions(), true)
      h.eq(UI_WIDTH, 1)
      h.eq(UI_HEIGHT, 1)
      h.eq(overlay.res_x, 1)
      h.eq(overlay.res_y, 1)
      h.properties['osd-width'] = 1441
      h.properties['osd-height'] = 811
      h.properties['display-hidpi-scale'] = 1.5
      update_ui_dimensions()
      h.eq(UI_WIDTH, 961, 'rounded width')
      h.eq(UI_HEIGHT, 541, 'rounded height')
    `, { properties: { 'osd-width': 0, 'osd-height': 0 } });
  });

  it('observes DPI changes immediately without writing playback volume or mute', async () => {
    await runMpvUiLua(movie, `
      volume = 37
      muted = true
      h.clear_commands()
      h.observe('display-hidpi-scale', 2)
      h.eq(UI_WIDTH, 480, 'DPI observer updates logical width')
      h.eq(UI_HEIGHT, 270)
      h.eq(overlay.res_x, 480)
      h.eq(volume, 37)
      h.eq(muted, true)
      h.eq(#h.find_commands('set','volume'), 0)
      h.eq(#h.find_commands('cycle','mute'), 0)
      h.eq(#h.find_commands('script-message','taluxa-settings-patch'), 0)
    `);
  });

  it.each([1, 1.5, 2])('projects cached thumbnails to raw OSD coordinates at DPI %s', async (dpi) => {
    await runMpvUiLua(series, `
      h.clear_commands()
      assert(add_episode_thumbnail_overlay(41, 101, 55, episode_items[1]))
      local command = h.find_commands('overlay-add')[1]
      h.eq(command[2], '41')
      h.eq(command[3], '${Math.round(101 * dpi)}', 'raw thumbnail x')
      h.eq(command[4], '${Math.round(55 * dpi)}', 'raw thumbnail y')
      h.eq(command[5], 'cached.bgra')
      h.eq(command[6], '0')
      h.eq(command[7], 'bgra')
      h.eq(command[8], '128', 'source width')
      h.eq(command[9], '72', 'source height')
      h.eq(command[10], '512', 'source stride')
      h.eq(command[11], '${128 * dpi}', 'raw display width')
      h.eq(command[12], '${72 * dpi}', 'raw display height')
      -- Stable geometry reuses the native overlay.
      assert(add_episode_thumbnail_overlay(41, 101, 55, episode_items[1]))
      h.eq(#h.find_commands('overlay-add'), 1)
      clear_episode_thumbnail_overlays()
      h.eq(#h.find_commands('overlay-remove'), 1)
    `, { properties: { 'osd-width': 960 * dpi, 'osd-height': 540 * dpi, 'display-hidpi-scale': dpi } });
  });

  it('invalidates native thumbnail cache when DPI changes at unchanged logical positions', async () => {
    await runMpvUiLua(series, `
      h.clear_commands()
      assert(add_episode_thumbnail_overlay(41, 100, 60, episode_items[1]))
      h.properties['osd-width'] = 1440
      h.properties['osd-height'] = 810
      h.properties['display-hidpi-scale'] = 1.5
      update_ui_dimensions()
      assert(add_episode_thumbnail_overlay(41, 100, 60, episode_items[1]))
      local added = h.find_commands('overlay-add')
      h.eq(#added, 2, 'native overlay refreshed')
      h.eq(#h.find_commands('overlay-remove'), 1, 'old native overlay removed')
      h.eq(added[2][3], '150')
      h.eq(added[2][4], '90')
      h.eq(added[2][11], '192')
      h.eq(added[2][12], '108')
      -- Source bitmap size and stride are independent of display dimensions.
      episode_items[1].thumbnail_width = 256
      episode_items[1].thumbnail_height = 144
      episode_items[1].thumbnail_stride = 1024
      assert(add_episode_thumbnail_overlay(41, 100, 60, episode_items[1]))
      added = h.find_commands('overlay-add')
      h.eq(added[3][8], '256')
      h.eq(added[3][9], '144')
      h.eq(added[3][10], '1024')
      h.eq(added[3][11], '192')
      h.eq(added[3][12], '108')
    `);
  });
});
