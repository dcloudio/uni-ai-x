cmake_minimum_required(VERSION 3.16)
project(uni_ai_md_bridge)

get_filename_component(UNI_AI_MD_DEMO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../.." ABSOLUTE)
if(NOT DEFINED OHOS_NATIVE_ROOT)
  set(OHOS_NATIVE_ROOT "D:/ProgramFiles/Huawei/DevEco Studio/sdk/default/openharmony/native")
endif()

# 桥接库同时构建 arm64-v8a 与 x86_64：hvigor 通过 -DCMAKE_OHOS_ARCH_ABI 给出当前 ABI，
# 独立脚本用 -DOHOS_ARCH 指定；预编译库、输出目录和 sysroot 目录都按当前 ABI 选择。
if(DEFINED CMAKE_OHOS_ARCH_ABI AND NOT CMAKE_OHOS_ARCH_ABI STREQUAL "")
  set(UNI_AI_MD_TARGET_ABI "${CMAKE_OHOS_ARCH_ABI}")
elseif(DEFINED OHOS_ARCH AND NOT OHOS_ARCH STREQUAL "")
  set(UNI_AI_MD_TARGET_ABI "${OHOS_ARCH}")
else()
  set(UNI_AI_MD_TARGET_ABI "arm64-v8a")
endif()
if(UNI_AI_MD_TARGET_ABI STREQUAL "x86_64")
  set(UNI_AI_MD_SYSROOT_TRIPLE "x86_64-linux-ohos")
else()
  set(UNI_AI_MD_SYSROOT_TRIPLE "aarch64-linux-ohos")
endif()

add_library(uni_ai_md_bridge SHARED uni_ai_md_bridge.cpp)
set_target_properties(uni_ai_md_bridge PROPERTIES PREFIX "" OUTPUT_NAME "libuni-ai-md_bridge")
set_target_properties(uni_ai_md_bridge PROPERTIES
  LIBRARY_OUTPUT_DIRECTORY "${CMAKE_BINARY_DIR}/libs/${UNI_AI_MD_TARGET_ABI}"
  SKIP_BUILD_RPATH TRUE
  BUILD_RPATH ""
  INSTALL_RPATH "")
add_library(libuni-ai-md SHARED IMPORTED)
set_target_properties(libuni-ai-md PROPERTIES
  IMPORTED_LOCATION "${UNI_AI_MD_DEMO_ROOT}/native/prebuilt/${UNI_AI_MD_TARGET_ABI}/libuni-ai-md.so"
  INTERFACE_INCLUDE_DIRECTORIES "${UNI_AI_MD_DEMO_ROOT}/native/include")
target_include_directories(uni_ai_md_bridge PRIVATE
  ${UNI_AI_MD_DEMO_ROOT}/native/include
  ${OHOS_NATIVE_ROOT}/sysroot/usr/include)
target_link_libraries(uni_ai_md_bridge PUBLIC libuni-ai-md)
target_link_libraries(uni_ai_md_bridge PRIVATE "${OHOS_NATIVE_ROOT}/sysroot/usr/lib/${UNI_AI_MD_SYSROOT_TRIPLE}/libace_napi.z.so")
target_compile_features(uni_ai_md_bridge PRIVATE cxx_std_17)

# release 配置交付给 HAR 的桥接库不留调试段和符号表（链接会从 SDK 启动对象带入
# .debug_*）；debug 构建保留符号，便于原生调试。
find_program(UNI_AI_MD_STRIP_TOOL NAMES llvm-strip
  HINTS "${OHOS_NATIVE_ROOT}/llvm/bin")
if(CMAKE_BUILD_TYPE STREQUAL "Release")
  if(UNI_AI_MD_STRIP_TOOL)
    add_custom_command(TARGET uni_ai_md_bridge POST_BUILD
      COMMAND "${UNI_AI_MD_STRIP_TOOL}" --strip-all $<TARGET_FILE:uni_ai_md_bridge>
      COMMENT "Stripping uni_ai_md_bridge")
  else()
    message(WARNING "llvm-strip not found; uni_ai_md_bridge keeps debug info")
  endif()
endif()
